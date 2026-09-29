/**
 * @fileoverview Vault CRUD, debounced encrypted writes, import/backup, and delete-all flows.
 */
import React, {
  createContext,
  useContext,
  useRef,
  useCallback,
  useMemo,
  useEffect,
  useState,
} from 'react';
import { useCoreState } from './CoreStateContext';
import { useUI } from './UIContext';
import { useAuth } from './AuthContext';
import { getLocale } from '../constants/localization';
import { EncryptedDatabase, PasswordCard } from '../types';
import { generateSecureId } from '../utils/secureRandom';
import { normalizeAppSettings, normalizeCards, ensureVaultSessionId } from '../utils/appSettings';
import { parseEncryptedDatabaseJson } from '../utils/encryptedDatabase';
import { applyDeletion, applyDeleteAllCards } from '../utils/dbMerge';
import { clearIconCache, invalidateIconCacheFor } from '../services/iconDetection';
import { persistUnlockCredentials } from '../services/biometrics';
import { notifications } from '../notifications/notificationRef';
import { decryptVaultPayload, isNativeKdfUnavailableError } from '../services/nativeVault';
import { exportSessionRootKeyHex } from '../services/sessionKey';
import { commitVault, hydrateVaultSecrets, getVaultSecretStore } from '../services/vaultSecrets';
import {
  normalizeTags,
  CARD_TITLE_MAX,
  CARD_LINK_MAX,
  clampField,
  preserveUrisOnLinkEdit,
  canonicalizePublicSessionId,
  canChangeCardType,
  isPersistedCardTypeFrozen,
} from '@pkey/core';
import { yieldToUi } from '../utils/yieldToUi';
import { enrichImportedCardsWithIcons } from '../services/importIcons';
import { useDebouncedVaultWrite, flushPendingDatabaseWrite } from '../hooks/useDebouncedVaultWrite';
import {
  enqueueHibpChecks,
  primaryPassword,
  pwHashFor,
  shouldAutoCheckHibp,
  isHibpEnabled,
  currentResultIsCurrent,
  isHibpCheckThrottled,
  hibpCooldownDaysRemaining,
  subscribeHibpBusy,
  subscribeHibpProgress,
  clearHibpQueue,
} from '../services/hibpOrchestrator';
import type { HibpRunProgress } from '../services/hibpOrchestrator';
import type { HibpCheckResult } from '../types';

export type DatabaseContextData = Readonly<{
  writeDatabaseToDisk: (newDb: EncryptedDatabase, immediate?: boolean) => Promise<void>;
  flushPendingWrite: () => Promise<void>;
  handleImportLocalBackup: () => Promise<void>;
  handleImportExternalCards: (cards: readonly PasswordCard[]) => Promise<void>;
  handleCreateNewCard: () => Promise<void>;
  /** True when this card's persisted type must not change. */
  isCardTypeLocked: (cardId: string) => boolean;
  handleUpdateCardValue: (
    cardId: string,
    field: keyof PasswordCard,
    value: PasswordCard[keyof PasswordCard]
  ) => void;
  handleUpdatePasswordListItem: (cardId: string, index: number, value: string) => void;
  handleAddPasswordListItem: (cardId: string) => void;
  handleSaveCard: (cardId: string) => void;
  handleSaveCardWithFields: (
    cardId: string,
    fieldsToUpdate?: Readonly<Partial<PasswordCard>>
  ) => void;
  handleDeleteCard: (cardId: string) => void;
  handleDeleteAllCards: () => void;
  executeDeleteAllCards: (cardCount: number) => Promise<void>;
  /** Explicitly checks one card's password against HIBP (opt-in action). */
  handleCheckCardPassword: (cardId: string) => void;
  /** Explicitly checks every PASSWORD card without a current result (opt-in action). */
  handleCheckAllPasswords: () => void;
  /** Immediately stops a running bulk HIBP check (queued entries are discarded). */
  handleStopHibpChecks: () => void;
  /** Card ids currently queued/in-flight in the serial HIBP check queue. */
  hibpPendingIds: readonly string[];
  /** Aggregated progress of the tracked bulk HIBP run, or null when idle. */
  hibpRunProgress: HibpRunProgress | null;
}>;

const DatabaseContext = createContext<DatabaseContextData>({} as DatabaseContextData);

/** Consumes vault mutation helpers from `DatabaseProvider`. */
export const useDatabase = () => useContext(DatabaseContext);

export { flushPendingDatabaseWrite };

/** Provides encrypted write paths and card create/update/delete/import handlers. */
export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    db,
    isLogged,
    setDb,
    dbRef,
    masterPassword,
    setMasterPassword,
    setIsLogged,
    setHasSession,
    setCustomPrompt,
    setCustomPromptInput,
    setDeleteAllConfirmCount,
    setOperationBusy,
    setAuthBusy,
    setImportStatusMessage,
  } = useCoreState();
  const { expandedCardId, setExpandedCardId } = useUI();

  const { performBiometricOrPasswordCheck, performBiometricAndPasswordCheck } = useAuth();

  const expandedCardIdRef = useRef(expandedCardId);
  expandedCardIdRef.current = expandedCardId;

  const getT = useCallback(() => getLocale(dbRef.current.settings?.language), [dbRef]);

  // Card ids currently queued/in-flight in the serial HIBP check queue.
  const [hibpPendingIds, setHibpPendingIds] = useState<readonly string[]>([]);
  useEffect(() => subscribeHibpBusy(setHibpPendingIds as (ids: string[]) => void), []);

  // Aggregated progress of the tracked bulk HIBP run (null while idle).
  const [hibpRunProgress, setHibpRunProgress] = useState<HibpRunProgress | null>(null);
  // Guards the summary toast so it fires exactly once per naturally finished
  // run and never for the initial snapshot or a user-stopped run.
  const lastPositiveRunRef = useRef(false);
  const sessionStampInFlightRef = useRef(false);
  useEffect(() => {
    // A naturally finished (non-stopped) bulk run emits one final summary
    // toast with the aggregated counts; a user-stopped run emits one toast
    // with the partial counts. Never one toast per card.
    return subscribeHibpProgress((progress) => {
      if (progress.active) {
        lastPositiveRunRef.current = true;
      } else if (progress.stopped) {
        lastPositiveRunRef.current = false;
        const t = getT();
        notifications.toast({
          title: t.hibp_action_label,
          message:
            progress.done === 0
              ? t.hibp_stopped_none
              : t.hibp_stopped_partial
                  .replace('{done}', String(progress.done))
                  .replace('{total}', String(progress.total)),
          variant: 'info',
          duration: 5000,
        });
      } else if (lastPositiveRunRef.current && progress.total > 0) {
        lastPositiveRunRef.current = false;
        const t = getT();
        notifications.toast({
          title: t.hibp_action_label,
          message: t.hibp_bulk_done
            .replace('{checked}', String(progress.done))
            .replace('{clean}', String(progress.clean))
            .replace('{breached}', String(progress.breached)),
          variant: 'info',
          duration: 5000,
        });
      } else {
        lastPositiveRunRef.current = false;
      }
      setHibpRunProgress(progress.active ? progress : null);
    });
  }, [getT]);

  const { writeDatabaseToDisk, flushWriteDatabaseToDisk, lastPersistedDbRef } =
    useDebouncedVaultWrite({
      isLogged,
      db,
      masterPassword,
      setDb,
      getT,
    });

  useEffect(() => {
    if (!isLogged) {
      sessionStampInFlightRef.current = false;
      return;
    }
    const current = dbRef.current;
    if (!current.passwordHash) return;
    if (canonicalizePublicSessionId(current.sessionId)) return;
    if (sessionStampInFlightRef.current) return;
    sessionStampInFlightRef.current = true;
    void writeDatabaseToDisk(ensureVaultSessionId(current), true);
  }, [isLogged, db.sessionId, db.passwordHash, dbRef, writeDatabaseToDisk]);

  /** Persists a fresh HIBP result on the matching card (no-op if the card vanished). */
  const applyHibpResult = useCallback(
    (cardId: string, result: HibpCheckResult) => {
      const currentDb = dbRef.current;
      const card = currentDb.cards.find((c) => c.id === cardId);
      if (!card) return;
      const updatedCards = currentDb.cards.map((c) =>
        c.id === cardId ? { ...c, hibp: result, last_update: new Date().toISOString() } : c
      );
      const updatedDb = {
        ...currentDb,
        cards: updatedCards,
        last_update: new Date().toISOString(),
      };
      void writeDatabaseToDisk(updatedDb);
    },
    [dbRef, writeDatabaseToDisk]
  );

  /** Runs a set of HIBP checks serially; optionally toast each outcome (manual actions). */
  const runHibpEntries = useCallback(
    (
      entries: { cardId: string; password: string; pwHash: string }[],
      opts?: { notifyToast?: boolean; trackProgress?: boolean }
    ) => {
      if (!entries.length) return;
      enqueueHibpChecks(entries, {
        trackProgress: opts?.trackProgress,
        isStillCurrent: (cardId, pwHash) => {
          const card = dbRef.current.cards.find((c) => c.id === cardId);
          if (!card) return false;
          const currentPassword = primaryPassword(getVaultSecretStore().cardWithSecrets(card));
          return !!currentPassword && pwHashFor(currentPassword) === pwHash;
        },
        onResult: (cardId, result) => {
          applyHibpResult(cardId, result);
          if (!opts?.notifyToast) return;
          const t = getT();
          const message =
            result.status === 'breached'
              ? t.hibp_result_breached.replace('{n}', String(result.count))
              : result.status === 'clean'
                ? t.hibp_result_clean
                : t.hibp_result_error.replace('{reason}', result.reason ?? 'unknown');
          notifications.toast({
            title: t.hibp_action_label,
            message,
            variant:
              result.status === 'breached'
                ? 'warning'
                : result.status === 'clean'
                  ? 'success'
                  : 'error',
            duration: 5000,
          });
        },
      });
    },
    [dbRef, applyHibpResult, getT]
  );

  /** Fire the auto-check for a saved card per the opt-in rules. */
  const scheduleAutoHibpCheck = useCallback(
    (updatedDb: EncryptedDatabase, cardId: string) => {
      const raw = updatedDb.cards.find((c) => c.id === cardId);
      if (!raw) return;
      const card = getVaultSecretStore().cardWithSecrets(raw);
      if (!shouldAutoCheckHibp(card, updatedDb)) return;
      const password = primaryPassword(card);
      runHibpEntries([{ cardId, password, pwHash: pwHashFor(password) }]);
    },
    [runHibpEntries]
  );

  /** Explicit per-card HIBP check (opt-in). Guards against disabled setting, empty passwords and hash cooldown. */
  const handleCheckCardPassword = useCallback(
    (cardId: string) => {
      const t = getT();
      const currentDb = dbRef.current;
      if (!isHibpEnabled(currentDb)) {
        notifications.toast({
          title: t.enable_hibp_check_title,
          message: t.hibp_disabled_hint,
          variant: 'warning',
          duration: 5000,
        });
        return;
      }
      const raw = currentDb.cards.find((c) => c.id === cardId);
      if (!raw || raw.type !== 'PASSWORD') return;
      const card = getVaultSecretStore().cardWithSecrets(raw);
      const password = primaryPassword(card);
      if (!password) {
        notifications.toast({
          title: t.hibp_action_label,
          message: t.hibp_empty_password_hint,
          variant: 'warning',
          duration: 5000,
        });
        return;
      }
      const pwHash = pwHashFor(password);
      if (isHibpCheckThrottled(currentDb.cards, pwHash)) {
        const days = hibpCooldownDaysRemaining(currentDb.cards, pwHash);
        notifications.toast({
          title: t.hibp_action_label,
          message: t.hibp_recheck_throttled.replace('{days}', String(days)),
          variant: 'info',
          duration: 5000,
        });
        return;
      }
      runHibpEntries([{ cardId, password, pwHash }], { notifyToast: true });
    },
    [getT, dbRef, runHibpEntries]
  );

  /** Explicit bulk HIBP check for every PASSWORD card without a current verified result. */
  const handleCheckAllPasswords = useCallback(() => {
    const t = getT();
    const currentDb = dbRef.current;
    if (!isHibpEnabled(currentDb)) {
      notifications.toast({
        title: t.enable_hibp_check_title,
        message: t.hibp_disabled_hint,
        variant: 'warning',
        duration: 5000,
      });
      return;
    }
    const entries: { cardId: string; password: string; pwHash: string }[] = [];
    // Classify cards so the "nothing to check" toast can explain WHY instead
    // of always claiming everything is verified.
    let passwordCount = 0;
    let alreadyChecked = 0;
    let throttled = 0;
    for (const raw of currentDb.cards) {
      if (!raw || raw.type !== 'PASSWORD') continue;
      const card = getVaultSecretStore().cardWithSecrets(raw);
      const password = primaryPassword(card);
      if (!password) continue;
      passwordCount++;
      const pwHash = pwHashFor(password);
      // Skip only passwords with a fresh non-error result; re-check errors and stale ones.
      if (currentResultIsCurrent(card, pwHash) && card.hibp?.status !== 'error') {
        alreadyChecked++;
        continue;
      }
      // Respect the per-hash cooldown across all cards: a duplicate password
      // already checked recently (anywhere in the vault) is not re-queried.
      if (isHibpCheckThrottled(currentDb.cards, pwHash)) {
        throttled++;
        continue;
      }
      entries.push({ cardId: card.id, password, pwHash });
    }
    if (!entries.length) {
      const message =
        passwordCount === 0
          ? t.hibp_no_cards
          : throttled > 0 && alreadyChecked === 0
            ? t.hibp_all_throttled
            : throttled > 0
              ? t.hibp_throttled_or_checked
              : t.hibp_none_to_check;
      notifications.toast({
        title: t.hibp_action_label,
        message,
        variant: 'info',
        duration: 4000,
      });
      return;
    }
    // Bulk runs never toast per card: the tracked run ends in a single
    // aggregated summary toast (see the progress subscription above).
    runHibpEntries(entries, { trackProgress: true });
  }, [getT, dbRef, runHibpEntries]);

  /** Stops a running bulk HIBP check immediately (queued cards are dropped). */
  const handleStopHibpChecks = useCallback(() => {
    clearHibpQueue();
  }, []);

  const handleImportLocalBackup = useCallback(async () => {
    const t = getT();
    setOperationBusy(t.import_pkey_reading);
    try {
      const { pickBackupFile } = require('../services/backup');
      const decodedString = await pickBackupFile();
      if (!decodedString) return;

      setCustomPromptInput('');
      setCustomPrompt({
        visible: true,
        title: t.decrypt_backup,
        message: t.import_pass_prompt,
        secure: true,
        busyMessage: t.import_pkey_decrypting,
        error: undefined,
        onConfirm: async (enteredKey: string) => {
          if (!enteredKey?.trim()) {
            setCustomPrompt((prev) => ({ ...prev, error: t.wrong_key_p }));
            return;
          }
          setAuthBusy(true);
          await yieldToUi();
          try {
            const decryptedTry = await decryptVaultPayload(enteredKey, decodedString);
            const testDb = decryptedTry ? parseEncryptedDatabaseJson(decryptedTry) : null;

            if (testDb && testDb.version) {
              const normalizedDb = {
                ...testDb,
                settings: normalizeAppSettings(testDb.settings, testDb.cards),
                cards: normalizeCards(testDb.cards),
              };

              const rootKeyHex = await exportSessionRootKeyHex();
              if (!rootKeyHex || !normalizedDb.salt) {
                throw new Error('session-root-missing');
              }
              // Never pass the master password itself — see biometrics.ts audit note (C2).
              await persistUnlockCredentials(
                rootKeyHex,
                normalizedDb.salt,
                normalizedDb.passwordHash
              );
              await writeDatabaseToDisk(normalizedDb, true);
              setDb(hydrateVaultSecrets(normalizedDb));
              lastPersistedDbRef.current = normalizedDb;
              setMasterPassword('');
              setHasSession(true);
              setIsLogged(true);
              setCustomPromptInput('');
              setCustomPrompt((prev: { visible: boolean }) => ({ ...prev, visible: false }));
              notifications.alert({
                title: t.alert_success_title,
                message: t.import_success,
                variant: 'success',
              });
            } else {
              setCustomPrompt((prev) => ({ ...prev, error: t.wrong_key_p }));
            }
          } catch (importErr) {
            console.warn('[DatabaseContext] import backup failed:', importErr);
            setCustomPrompt((prev) => ({
              ...prev,
              error: isNativeKdfUnavailableError(importErr)
                ? t.auth_native_kdf_unavailable
                : t.wrong_key_p,
            }));
          } finally {
            setAuthBusy(false);
          }
        },
      });
    } catch (err) {
      console.warn(err);
      notifications.alert({
        title: t.alert_error_title,
        message: t.error_importing_file,
        variant: 'error',
      });
    } finally {
      setOperationBusy(null);
    }
  }, [
    getT,
    setOperationBusy,
    setCustomPromptInput,
    setCustomPrompt,
    setAuthBusy,
    setMasterPassword,
    setDb,
    setIsLogged,
    setHasSession,
  ]);

  const handleImportExternalCards = useCallback(
    async (incoming: readonly PasswordCard[]) => {
      if (!incoming.length) return;
      const t = getT();
      try {
        const enriched = await enrichImportedCardsWithIcons(
          incoming,
          (current, total) => {
            setImportStatusMessage(
              t.import_manager_icons_progress
                .replace('{current}', String(current))
                .replace('{total}', String(total))
            );
          },
          // Privacy-first: only fetch remote favicons when opted in and not in
          // strict offline (M5).
          {
            allowRemoteFavicon:
              dbRef.current?.settings?.enableFaviconLookup === true &&
              dbRef.current?.settings?.strictOffline !== true,
          }
        );
        setImportStatusMessage(t.import_manager_saving);
        await yieldToUi();
        const currentDb = dbRef.current;
        const merged = [...enriched, ...currentDb.cards];
        const updatedDb = {
          ...currentDb,
          cards: normalizeCards(merged),
          last_update: new Date().toISOString(),
        };
        await writeDatabaseToDisk(updatedDb, true);
      } finally {
        setImportStatusMessage(null);
      }
    },
    [getT, setImportStatusMessage, writeDatabaseToDisk, dbRef]
  );

  const handleCreateNewCard = useCallback(async () => {
    const currentDb = dbRef.current;
    const now = new Date().toISOString();
    const newCard: PasswordCard = {
      id: generateSecureId(),
      type: 'PASSWORD',
      title: '',
      icon: { type: 'icon', value: 'key-outline' },
      username: '',
      passwordList: [''],
      link: '',
      notes: '',
      creation_date: now,
      last_update: now,
      hibpAuthorized: currentDb.settings?.enableHibpCheck === true,
    };

    const updatedCards = [newCard, ...currentDb.cards];
    const updatedDb = { ...currentDb, cards: updatedCards, last_update: now };

    setExpandedCardId(newCard.id);
    await writeDatabaseToDisk(updatedDb, true);
  }, [dbRef, setExpandedCardId, writeDatabaseToDisk]);

  const persistedCard = useCallback(
    (cardId: string): PasswordCard | undefined =>
      lastPersistedDbRef.current?.cards.find((c) => c.id === cardId),
    [lastPersistedDbRef]
  );

  const isCardTypeLocked = useCallback(
    (cardId: string): boolean => {
      const snapshot = persistedCard(cardId) ?? dbRef.current.cards.find((c) => c.id === cardId);
      if (!snapshot) return false;
      return isPersistedCardTypeFrozen(snapshot);
    },
    [dbRef, persistedCard]
  );

  const handleUpdateCardValue = useCallback(
    (cardId: string, field: keyof PasswordCard, value: PasswordCard[keyof PasswordCard]) => {
      const currentDb = dbRef.current;
      const updatedCards = currentDb.cards.map((card) => {
        if (card.id !== cardId) return card;
        if (field === 'type') {
          const snapshot = persistedCard(cardId) ?? card;
          const nextType = value as PasswordCard['type'];
          if (
            nextType !== snapshot.type &&
            (isPersistedCardTypeFrozen(snapshot) || !canChangeCardType(card))
          ) {
            return card;
          }
        }
        const next =
          field === 'tags'
            ? normalizeTags(
                Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,;]/) : []
              )
            : value;
        return { ...card, [field]: next, last_update: new Date().toISOString() };
      });
      setDb(commitVault({ ...currentDb, cards: updatedCards }).ui);
    },
    [dbRef, persistedCard, setDb]
  );

  const handleUpdatePasswordListItem = useCallback(
    (cardId: string, index: number, value: string) => {
      const currentDb = dbRef.current;
      const hibpAuthorized = currentDb.settings?.enableHibpCheck === true;
      const updatedCards = currentDb.cards.map((card) => {
        if (card.id === cardId) {
          const newList = [...card.passwordList];
          newList[index] = value;
          return {
            ...card,
            passwordList: newList,
            hibpAuthorized,
            last_update: new Date().toISOString(),
          };
        }
        return card;
      });
      setDb(commitVault({ ...currentDb, cards: updatedCards }).ui);
    },
    [dbRef, setDb]
  );

  const handleAddPasswordListItem = useCallback(
    (cardId: string) => {
      const currentDb = dbRef.current;
      const hibpAuthorized = currentDb.settings?.enableHibpCheck === true;
      const updatedCards = currentDb.cards.map((card) => {
        if (card.id === cardId) {
          return {
            ...card,
            passwordList: [...card.passwordList, ''],
            hibpAuthorized,
            last_update: new Date().toISOString(),
          };
        }
        return card;
      });
      setDb(commitVault({ ...currentDb, cards: updatedCards }).ui);
    },
    [dbRef, setDb]
  );

  const handleSaveCard = useCallback(
    (cardId: string) => {
      const t = getT();
      const currentDb = dbRef.current;
      const card = currentDb.cards.find((c) => c.id === cardId);
      if (!card) return;

      const snapshot = persistedCard(cardId);
      let cardToWrite = card;
      if (snapshot && card.type !== snapshot.type && isPersistedCardTypeFrozen(snapshot)) {
        cardToWrite = {
          ...card,
          type: snapshot.type,
          passwordList: snapshot.passwordList,
          otpSecret: snapshot.otpSecret,
          otpAlgorithm: snapshot.otpAlgorithm,
          otpDigits: snapshot.otpDigits,
          otpPeriod: snapshot.otpPeriod,
        };
        notifications.toast({
          title: t.card_type_change_blocked_title,
          message: t.card_type_change_blocked_desc,
          variant: 'warning',
        });
      }

      const rawTitle = cardToWrite.title.trim() === '' ? t.default_card_name : cardToWrite.title;
      const formattedTitle = clampField(rawTitle, CARD_TITLE_MAX).value;
      const updatedCards = currentDb.cards.map((c) => {
        if (c.id === cardId) {
          return {
            ...cardToWrite,
            title: formattedTitle,
            last_update: new Date().toISOString(),
          };
        }
        return c;
      });

      const updatedDb = {
        ...currentDb,
        cards: updatedCards,
        last_update: new Date().toISOString(),
      };
      void writeDatabaseToDisk(updatedDb);
      scheduleAutoHibpCheck(updatedDb, cardId);
    },
    [getT, dbRef, persistedCard, writeDatabaseToDisk, scheduleAutoHibpCheck]
  );

  const handleSaveCardWithFields = useCallback(
    (cardId: string, fieldsToUpdate: Readonly<Partial<PasswordCard>> = {}) => {
      const t = getT();
      const currentDb = dbRef.current;
      const card = currentDb.cards.find((c) => c.id === cardId);
      if (!card) return;

      const snapshot = persistedCard(cardId);
      const patch = { ...fieldsToUpdate };
      if (
        snapshot &&
        patch.type &&
        patch.type !== snapshot.type &&
        isPersistedCardTypeFrozen(snapshot)
      ) {
        delete patch.type;
        delete patch.passwordList;
        delete patch.otpSecret;
        delete patch.otpAlgorithm;
        delete patch.otpDigits;
        delete patch.otpPeriod;
        notifications.toast({
          title: t.card_type_change_blocked_title,
          message: t.card_type_change_blocked_desc,
          variant: 'warning',
        });
      }

      const rawTitle = patch.title?.trim() === '' ? t.default_card_name : patch.title || card.title;
      const formattedTitle = clampField(rawTitle, CARD_TITLE_MAX).value;
      const nextLink = clampField(patch.link ?? card.link ?? '', CARD_LINK_MAX).value;
      const linkFields = preserveUrisOnLinkEdit(card, nextLink);

      const updatedCards = currentDb.cards.map((c) => {
        if (c.id === cardId) {
          return {
            ...c,
            ...patch,
            title: formattedTitle,
            link: linkFields.link,
            uris: linkFields.uris,
            last_update: new Date().toISOString(),
          };
        }
        return c;
      });

      const updatedDb = {
        ...currentDb,
        cards: updatedCards,
        last_update: new Date().toISOString(),
      };
      void writeDatabaseToDisk(updatedDb);
      scheduleAutoHibpCheck(updatedDb, cardId);
    },
    [getT, dbRef, persistedCard, writeDatabaseToDisk, scheduleAutoHibpCheck]
  );

  const handleDeleteCard = useCallback(
    (cardId: string) => {
      const t = getT();
      const currentDb = dbRef.current;
      const card = currentDb.cards.find((c) => c.id === cardId);
      if (!card) return;

      const cardTitle = card.title.trim() === '' ? t.default_card_name : card.title.trim();

      performBiometricOrPasswordCheck(() => {
        notifications.alert({
          title: t.confirm_delete_title,
          message: t.confirm_delete,
          variant: 'warning',
          actions: [
            { text: t.cancel_button, style: 'cancel' },
            {
              text: t.delete_button,
              style: 'destructive',
              onPress: () => {
                const updatedDb = applyDeletion(dbRef.current, cardId);
                void writeDatabaseToDisk(updatedDb);
                invalidateIconCacheFor(card.title, card.link);
                if (expandedCardIdRef.current === cardId) setExpandedCardId(null);

                notifications.toast({
                  title: t.notif_card_deleted_title,
                  message: t.notif_card_deleted_toast.replace('{title}', cardTitle),
                  variant: 'success',
                  duration: 4000,
                });
              },
            },
          ],
        });
      }, t.require_auth_delete);
    },
    [getT, dbRef, performBiometricOrPasswordCheck, writeDatabaseToDisk, setExpandedCardId]
  );

  const handleDeleteAllCards = useCallback(() => {
    const t = getT();
    const cardCount = dbRef.current.cards?.length ?? 0;
    if (cardCount === 0) {
      notifications.alert({
        title: t.alert_warning_title,
        message: t.delete_all_empty,
        variant: 'warning',
      });
      return;
    }

    void performBiometricAndPasswordCheck(
      () => setDeleteAllConfirmCount(cardCount),
      t.require_auth_delete_all_bio,
      t.require_auth_delete_all_pass
    );
  }, [getT, dbRef, performBiometricAndPasswordCheck, setDeleteAllConfirmCount]);

  const executeDeleteAllCards = useCallback(
    async (cardCount: number) => {
      const t = getT();
      try {
        await yieldToUi();
        const updatedDb = applyDeleteAllCards(dbRef.current);
        await writeDatabaseToDisk(updatedDb, true);
        clearIconCache();
        if (expandedCardIdRef.current) setExpandedCardId(null);
        setDeleteAllConfirmCount(null);
        notifications.toast({
          title: t.delete_all_success_title,
          message: t.delete_all_success_toast.replace('{n}', String(cardCount)),
          variant: 'success',
          duration: 5000,
        });
      } catch (err) {
        console.error('[DatabaseContext] delete all cards failed:', err);
        notifications.alert({
          title: t.alert_error_title,
          message: t.delete_all_error,
          variant: 'error',
        });
        throw err;
      }
    },
    [getT, dbRef, writeDatabaseToDisk, setExpandedCardId, setDeleteAllConfirmCount]
  );

  const value = useMemo(
    () => ({
      writeDatabaseToDisk,
      flushPendingWrite: flushWriteDatabaseToDisk,
      handleImportLocalBackup,
      handleImportExternalCards,
      handleCreateNewCard,
      isCardTypeLocked,
      handleUpdateCardValue,
      handleUpdatePasswordListItem,
      handleAddPasswordListItem,
      handleSaveCard,
      handleSaveCardWithFields,
      handleDeleteCard,
      handleDeleteAllCards,
      executeDeleteAllCards,
      handleCheckCardPassword,
      handleCheckAllPasswords,
      handleStopHibpChecks,
      hibpPendingIds,
      hibpRunProgress,
    }),
    [
      writeDatabaseToDisk,
      flushWriteDatabaseToDisk,
      handleImportLocalBackup,
      handleImportExternalCards,
      handleCreateNewCard,
      isCardTypeLocked,
      handleUpdateCardValue,
      handleUpdatePasswordListItem,
      handleAddPasswordListItem,
      handleSaveCard,
      handleSaveCardWithFields,
      handleDeleteCard,
      handleDeleteAllCards,
      executeDeleteAllCards,
      handleCheckCardPassword,
      handleCheckAllPasswords,
      handleStopHibpChecks,
      hibpPendingIds,
      hibpRunProgress,
    ]
  );

  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>;
};
