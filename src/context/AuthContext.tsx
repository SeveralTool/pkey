/**
 * @fileoverview Session auth: create/open vault, biometric unlock, logout, and re-auth prompts.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { flushPendingDatabaseWrite } from '../hooks/useDebouncedVaultWrite';
import { useCoreState } from './CoreStateContext';
import { useUI } from './UIContext';
import { useBackgroundAutoLogout } from '../hooks/useBackgroundAutoLogout';
import { useScreenshotPolicy } from '../hooks/useScreenshotPolicy';
import { waitForPostBiometricUi } from '../utils/waitForPostBiometricUi';
import { upgradeVaultOnUnlock } from './auth/upgradeVaultOnUnlock';
import { getLocale } from '../constants/localization';
import { notifications } from '../notifications/notificationRef';
import {
  authenticateBiometric,
  persistUnlockCredentials,
  loadUnlockBundle,
  peekUnlockBundle,
  clearUnlockCredentials,
  destroyMasterKey,
  UnlockCredentials,
} from '../services/biometrics';
import {
  readEncryptedPayload,
  writeDatabaseToDisk as writeDbService,
  destroyDatabase,
} from '../services/storage';
import { LocalCipher } from '../services/crypto';
import { generateUuidV4, normalizeTheme } from '@pkey/core';
import { normalizeAppSettings, normalizeCards, ensureVaultSessionId } from '../utils/appSettings';
import { parseEncryptedDatabaseJson } from '../utils/encryptedDatabase';
import { getNewInstallUiDefaults } from '../utils/devicePreferences';
import { evaluateMasterPasswordStrength } from '../utils/masterPasswordPolicy';
import { EncryptedDatabase } from '../types';
import {
  setSessionRootKey,
  clearSessionRootKey,
  getSessionNativeHandle,
} from '../services/sessionKey';
import {
  decryptVaultPayload,
  decryptVaultWithImportedKey,
  establishSessionFromPassword,
  isNativeKdfUnavailableError,
  verifyTypedPassword,
} from '../services/nativeVault';
import { getUnlockBlockRemainingMs, recordUnlockFailure } from '../services/unlockThrottle';
import {
  getLastSuccessfulUnlock,
  getUnlockHistory,
  recordUnlockEvent,
  type UnlockEvent,
  type UnlockMethod,
} from '../services/unlockHistory';
import { yieldToUi } from '../utils/yieldToUi';
import { clearAutofillCache, syncAutofillCache } from '../services/autofill';
import { flushSecureClipboard } from '../services/secureClipboard';
import { clearSyncUndo } from '../services/syncUndo';
import {
  hydrateVaultSecrets,
  clearVaultSecrets,
  cardsWithVaultSecrets,
} from '../services/vaultSecrets';
import { createEmptySessionDatabase } from '../utils/emptySessionDatabase';
import { useForegroundIdleLock } from '../hooks/useForegroundIdleLock';
import { stopWebAccessOnVaultLock } from '../utils/webAccessLock';

export type AuthContextData = Readonly<{
  handleCreateSession: () => Promise<void>;
  handleOpenSession: (pass: string) => Promise<void>;
  handleBiometricLogin: () => Promise<void>;
  handleLogout: () => void;
  /** Danger zone: bio (if available) + master password, then show confirm modal. */
  handleResetSession: () => void;
  /** Wipes local vault and biometric unlock material; returns to create-session. */
  executeResetSession: () => Promise<void>;
  performBiometricOrPasswordCheck: (onSuccess: () => void, textPrompt: string) => Promise<void>;
  performBiometricAndPasswordCheck: (
    onSuccess: () => void,
    biometricPrompt: string,
    passwordPrompt: string
  ) => Promise<void>;
  /** Current session unlock timestamp (memory; cleared on logout). */
  unlockedAt: string | null;
  /** How the current session was unlocked. */
  unlockMethod: UnlockMethod | null;
  /** Last successful unlock persisted across logout/kill. */
  lastUnlock: UnlockEvent | null;
  /** Recent unlock attempts (success + failure), newest first. */
  unlockHistory: readonly UnlockEvent[];
  refreshUnlockHistory: () => Promise<void>;
}>;

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

/** Consumes auth actions from the nearest `AuthProvider`. */
export const useAuth = () => useContext(AuthContext);

/** Provides vault unlock/create/logout and biometric re-auth helpers. */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    db,
    setDb,
    masterPassword,
    setMasterPassword,
    repeatPassword,
    setRepeatPassword,
    validationError,
    setValidationError,
    isLogged,
    setIsLogged,
    hasSession,
    setHasSession,
    biometricsAvailable,
    setCustomPrompt,
    setCustomPromptInput,
    setAuthBusy,
    setResetSessionConfirmVisible,
  } = useCoreState();
  const { setExpandedCardId, setCardsFilter, setCardsSortMode } = useUI();

  const [unlockedAt, setUnlockedAt] = useState<string | null>(null);
  const [unlockMethod, setUnlockMethod] = useState<UnlockMethod | null>(null);
  const [lastUnlock, setLastUnlock] = useState<UnlockEvent | null>(null);
  const [unlockHistory, setUnlockHistory] = useState<UnlockEvent[]>([]);

  const getT = () => getLocale(db.settings?.language);

  const refreshUnlockHistory = useCallback(async () => {
    const [last, history] = await Promise.all([getLastSuccessfulUnlock(), getUnlockHistory()]);
    setLastUnlock(last);
    setUnlockHistory(history);
  }, []);

  useEffect(() => {
    void refreshUnlockHistory();
  }, [refreshUnlockHistory]);

  const markUnlockSuccess = useCallback(async (method: UnlockMethod) => {
    const event = await recordUnlockEvent(method, true);
    setUnlockedAt(event.at);
    setUnlockMethod(method);
    setLastUnlock(event);
    setUnlockHistory(await getUnlockHistory());
  }, []);

  const markUnlockFailure = useCallback(async (method: UnlockMethod) => {
    await recordUnlockEvent(method, false);
    setUnlockHistory(await getUnlockHistory());
  }, []);

  useEffect(() => {
    if (!isLogged) return;
    setCustomPromptInput('');
    setCustomPrompt((prev) => (prev.visible ? { ...prev, visible: false } : prev));
  }, [isLogged, setCustomPrompt, setCustomPromptInput]);

  useScreenshotPolicy(isLogged, db.settings?.allowScreenshots, db.settings?.language);

  const promptMasterPasswordVerify = (passwordPrompt: string, onSuccess: () => void) => {
    const t = getT();
    setCustomPromptInput('');
    setCustomPrompt({
      visible: true,
      title: t.enter_pass,
      message: passwordPrompt,
      secure: true,
      busyMessage: '',
      error: undefined,
      onConfirm: async (inputPassword: string) => {
        const showPromptError = () => {
          setCustomPrompt((prev) => ({ ...prev, error: t.wrong_key_p }));
        };
        if (!inputPassword?.trim()) {
          showPromptError();
          return;
        }
        setAuthBusy(true);
        await yieldToUi();
        try {
          const ok = await verifyTypedPassword(inputPassword, db.passwordHash, db.salt);
          if (ok) {
            setCustomPromptInput('');
            setCustomPrompt((prev) => ({ ...prev, visible: false, error: undefined }));
            onSuccess();
          } else {
            showPromptError();
          }
        } catch (err) {
          console.warn('[AuthContext] password verification failed:', err);
          showPromptError();
        } finally {
          setAuthBusy(false);
        }
      },
    });
  };

  const performBiometricOrPasswordCheck = async (onSuccess: () => void, textPrompt: string) => {
    const t = getT();
    if (biometricsAvailable) {
      const success = await authenticateBiometric(
        textPrompt || t.biometrics_reason,
        t.login_placeholder
      );
      if (success) {
        onSuccess();
        return;
      }
    }
    promptMasterPasswordVerify(textPrompt, onSuccess);
  };

  /** Biometric gate when hardware is enrolled, then master password always required. */
  const performBiometricAndPasswordCheck = async (
    onSuccess: () => void,
    biometricPrompt: string,
    passwordPrompt: string
  ) => {
    const t = getT();
    if (!db.passwordHash || !db.salt) {
      notifications.alert({
        title: t.alert_error_title,
        message: t.authenticate_empty_session,
        variant: 'error',
      });
      return;
    }
    if (biometricsAvailable) {
      try {
        const bioOk = await authenticateBiometric(
          biometricPrompt || t.biometrics_reason,
          t.login_placeholder
        );
        if (!bioOk) return;
        await waitForPostBiometricUi();
      } catch (err) {
        console.warn('[AuthContext] biometric verification failed:', err);
        notifications.alert({
          title: t.alert_error_title,
          message: t.biometric_auth_failed,
          variant: 'error',
        });
        return;
      }
    }
    promptMasterPasswordVerify(passwordPrompt, onSuccess);
  };

  const closeLoginPrompt = () => {
    setCustomPromptInput('');
    setCustomPrompt((prev) => (prev.visible ? { ...prev, visible: false } : prev));
  };

  const finalizeSuccessfulLogin = async (
    pass: string,
    parsedDb: EncryptedDatabase,
    encryptedPayload: string,
    method: UnlockMethod = 'password'
  ) => {
    const normalizedDb = await upgradeVaultOnUnlock(pass, parsedDb, encryptedPayload);
    setMasterPassword('');
    setDb(hydrateVaultSecrets(normalizedDb));
    closeLoginPrompt();
    await markUnlockSuccess(method);
    setIsLogged(true);
  };

  const tryFastUnlockFromCredentials = async (
    credentials: UnlockCredentials,
    encryptedPayload: string,
    method: UnlockMethod = 'biometrics'
  ): Promise<boolean> => {
    // Accept v2 OR v3 envelopes on the fast path — the SecureStore-persisted
    // root key is byte-identical across the migration (only the ITERATION
    // count changed for freshly-created v3 vaults). If the on-disk envelope
    // is v3 but the persisted root is v2-derived (or vice versa) the
    // constant-time HMAC check will fail and we fall through to the password
    // form, which then triggers a proper migration.
    let envelope: { v?: unknown; kdfSalt?: unknown };
    try {
      envelope = JSON.parse(encryptedPayload.trim()) as { v?: unknown; kdfSalt?: unknown };
    } catch {
      return false;
    }

    if (envelope.v !== 2 && envelope.v !== 3 && envelope.v !== 4) return false;
    if (typeof envelope.kdfSalt !== 'string' || envelope.kdfSalt !== credentials.kdfSalt) {
      return false;
    }

    const decryptedString = await decryptVaultWithImportedKey(
      credentials.rootKeyHex,
      encryptedPayload
    );
    if (!decryptedString) return false;

    const parsedDb = parseEncryptedDatabaseJson(decryptedString);
    if (!parsedDb?.passwordHash || !parsedDb.salt) return false;
    if (!LocalCipher.secureCompare(parsedDb.passwordHash, credentials.authHash)) {
      await clearUnlockCredentials();
      return false;
    }

    // Infer auth scheme from root vs on-disk verifier so the PWA challenge
    // advertises the correct HMAC key even when passwordHashScheme was never
    // stamped (vaults upgraded mid-audit before the scheme field existed).
    const { deriveAuthVerifier } = require('@pkey/core') as typeof import('@pkey/core');
    const inferredScheme = LocalCipher.secureCompare(
      deriveAuthVerifier(credentials.rootKeyHex),
      parsedDb.passwordHash
    )
      ? ('v3-hkdf' as const)
      : ('v2-pbkdf2' as const);

    const normalizedDb = ensureVaultSessionId({
      ...parsedDb,
      passwordHashScheme: parsedDb.passwordHashScheme ?? inferredScheme,
      settings: normalizeAppSettings(parsedDb.settings, parsedDb.cards),
      cards: normalizeCards(parsedDb.cards),
    });

    if (!getSessionNativeHandle()) {
      setSessionRootKey(credentials.rootKeyHex, normalizedDb.salt!);
    }
    setMasterPassword('');
    setDb(hydrateVaultSecrets(normalizedDb));
    if (!parsedDb.passwordHashScheme || parsedDb.sessionId !== normalizedDb.sessionId) {
      // Persist the stamp without a master-password prompt (session root is live).
      void writeDbService(normalizedDb, '').catch(() => {
        /* best-effort — in-memory scheme still helps this session */
      });
    }
    closeLoginPrompt();
    await markUnlockSuccess(method);
    setIsLogged(true);
    return true;
  };

  /**
   * Biometric-only fast unlock: skips PBKDF2 using persisted root key.
   * Never called from manual password login.
   */
  const tryFastUnlock = async (pass: string, encryptedPayload: string): Promise<boolean> => {
    const bundle = await loadUnlockBundle(getT().biometrics_reason);
    if (!bundle) return false;
    LocalCipher.seedRootKeyCache(pass, bundle.kdfSalt, bundle.rootKeyHex);
    return tryFastUnlockFromCredentials(bundle, encryptedPayload);
  };

  const formatUnlockLockedError = (remainingMs: number): string => {
    return getT().login_locked_countdown.replace('{n}', String(Math.ceil(remainingMs / 1000)));
  };

  const handleOpenSessionSlow = async (
    pass: string,
    encryptedPayload: string,
    method: UnlockMethod = 'password'
  ) => {
    const t = getT();

    const decryptedString = await decryptVaultPayload(pass, encryptedPayload);
    const parsedDb = parseEncryptedDatabaseJson(decryptedString);

    if (parsedDb?.passwordHash && parsedDb.salt) {
      await finalizeSuccessfulLogin(pass, parsedDb, encryptedPayload, method);
    } else {
      const blockedMs = await recordUnlockFailure();
      await markUnlockFailure(method);
      setValidationError(blockedMs > 0 ? formatUnlockLockedError(blockedMs) : t.wrong_key_p);
    }
  };

  const handleCreateSession = async () => {
    const t = getT();
    setValidationError('');
    const strength = evaluateMasterPasswordStrength(masterPassword);
    if (!strength.ok) {
      setValidationError(strength.reason === 'weak' ? t.p_strength_warn : t.p_length_warn);
      return;
    }
    if (masterPassword !== repeatPassword) {
      setValidationError(t.p_match_warn);
      return;
    }

    setAuthBusy(true);
    await yieldToUi();

    const { WordArray, Hex } = require('crypto-es');
    const salt = WordArray.random(16).toString(Hex);

    // Prefer prefs already shown on the create-session screen (device defaults);
    // re-read device if somehow missing (e.g. legacy in-memory state).
    const deviceUi = getNewInstallUiDefaults();
    try {
      const { rootKeyHex, authVerifier } = await establishSessionFromPassword(masterPassword, salt);
      const initialDb: EncryptedDatabase = {
        version: '1.0.0',
        creation_date: new Date().toISOString(),
        last_update: new Date().toISOString(),
        passwordHash: authVerifier,
        passwordHashScheme: 'v4-argon2',
        salt: salt,
        sessionId: generateUuidV4(),
        settings: {
          autoLogout: '1M',
          webAutoLogout: '15M',
          language:
            db.settings?.language === 'ING' ||
            db.settings?.language === 'ESP' ||
            db.settings?.language === 'AUTO'
              ? db.settings.language
              : deviceUi.language,
          autoCollapse: true,
          allowScreenshots: false,
          theme: db.settings?.theme ? normalizeTheme(db.settings.theme) : deviceUi.theme,
          genSymbols: true,
          genNumbers: true,
          genUppercase: true,
          genLowercase: true,
          genLength: 32,
          openLinksInAppBrowser: false,
          webAccessAutoStart: false,
          webConfirmOnPhone: false,
          webLoginOnPhone: false,
          groupCardsByLink: false,
          foregroundIdleLock: '15M',
          strictOffline: false,
          bindDeviceSecret: false,
        },
        cards: [],
      };

      setDb(initialDb);
      await writeDbService(initialDb, '');
      // Never pass the master password itself — see biometrics.ts audit note (C2).
      await persistUnlockCredentials(rootKeyHex, salt, authVerifier);
      setMasterPassword('');
      setHasSession(true);
      await markUnlockSuccess('password');
      setIsLogged(true);
    } catch (e) {
      console.error('[AuthContext] handleCreateSession failed:', e);
      clearSessionRootKey();
      notifications.alert({
        title: t.alert_error_title,
        message: isNativeKdfUnavailableError(e)
          ? t.auth_native_kdf_unavailable
          : t.filesystem_init_failed,
        variant: 'error',
      });
    } finally {
      setAuthBusy(false);
    }
  };

  /** Manual password login — never reads SecureStore (no biometric prompt). */
  const handleOpenSession = async (pass: string) => {
    const t = getT();
    setValidationError('');

    const blockedMs = await getUnlockBlockRemainingMs();
    if (blockedMs > 0) {
      setValidationError(formatUnlockLockedError(blockedMs));
      return;
    }

    setAuthBusy(true);
    await yieldToUi();
    try {
      const encryptedPayload = await readEncryptedPayload();
      if (!encryptedPayload) {
        notifications.alert({
          title: t.alert_error_title,
          message: t.authenticate_empty_session,
          variant: 'error',
        });
        return;
      }

      await handleOpenSessionSlow(pass, encryptedPayload);
    } catch (err) {
      if (isNativeKdfUnavailableError(err)) {
        setValidationError(t.auth_native_kdf_unavailable);
        return;
      }
      setValidationError(t.wrong_key_p);
    } finally {
      setAuthBusy(false);
    }
  };

  /** Biometric login — one OS prompt, then fast unlock from stored bundle. */
  const handleBiometricLogin = async () => {
    const t = getT();
    if (!biometricsAvailable) return;

    setAuthBusy(true);
    await yieldToUi();
    try {
      const encryptedPayload = await readEncryptedPayload();
      if (!encryptedPayload) {
        notifications.alert({
          title: t.alert_error_title,
          message: t.authenticate_empty_session,
          variant: 'error',
        });
        return;
      }

      if (!(await peekUnlockBundle())) {
        // No enrolled unlock credentials (e.g. right after migration). Stay on login password field.
        setValidationError(t.login_bio_needs_password);
        return;
      }

      const bundle = await loadUnlockBundle(t.biometrics_reason);
      // Null usually means the user cancelled the OS prompt — do not log as a failure.
      if (!bundle) return;

      const fastOk = await tryFastUnlockFromCredentials(bundle, encryptedPayload, 'biometrics');
      if (fastOk) return;

      // Credentials no longer match this vault (migration / password change). Clear and use password.
      await clearUnlockCredentials();
      setValidationError(t.login_bio_needs_password);
    } finally {
      setAuthBusy(false);
    }
  };

  /**
   * Stops LAN web access immediately, flushes a pending vault write, then
   * clears session keys and unlock UI state.
   */
  const handleLogout = () => {
    stopWebAccessOnVaultLock();
    void (async () => {
      try {
        await flushPendingDatabaseWrite();
      } finally {
        LocalCipher.clearPbkdf2Cache();
        clearSessionRootKey();
        clearVaultSecrets();
        setDb(createEmptySessionDatabase());
        void clearAutofillCache();
        void flushSecureClipboard();
        clearSyncUndo();
        setMasterPassword('');
        setRepeatPassword('');
        setUnlockedAt(null);
        setUnlockMethod(null);
        setIsLogged(false);
        setExpandedCardId(null);
        setCardsFilter(null);
        setCardsSortMode('updated');
      }
    })();
  };

  useBackgroundAutoLogout({
    isLogged,
    autoLogout: db?.settings?.autoLogout,
    onLogout: handleLogout,
  });

  useForegroundIdleLock({
    isLogged,
    foregroundIdleLock: db?.settings?.foregroundIdleLock,
    onLogout: handleLogout,
  });

  useEffect(() => {
    if (!isLogged) {
      void clearAutofillCache();
      return;
    }
    if (db?.cards) void syncAutofillCache(cardsWithVaultSecrets(db.cards));
  }, [isLogged, db?.cards]);

  const handleResetSession = () => {
    const t = getT();
    void performBiometricAndPasswordCheck(
      () => setResetSessionConfirmVisible(true),
      t.require_auth_reset_session_bio,
      t.require_auth_reset_session_pass
    );
  };

  const executeResetSession = async () => {
    const t = getT();
    stopWebAccessOnVaultLock();
    try {
      await flushPendingDatabaseWrite();
      await yieldToUi();
      await destroyDatabase();
      await destroyMasterKey();
      LocalCipher.clearPbkdf2Cache();
      clearSessionRootKey();
      clearVaultSecrets();
      void clearAutofillCache();
      setDb(createEmptySessionDatabase());
      setHasSession(false);
      setIsLogged(false);
      setUnlockedAt(null);
      setUnlockMethod(null);
      setMasterPassword('');
      setRepeatPassword('');
      setValidationError('');
      setExpandedCardId(null);
      setCardsFilter(null);
      setCardsSortMode('updated');
      setResetSessionConfirmVisible(false);
    } catch (err) {
      console.error('[AuthContext] executeResetSession failed:', err);
      notifications.alert({
        title: t.alert_error_title,
        message: t.reset_session_error,
        variant: 'error',
      });
      throw err;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        handleCreateSession,
        handleOpenSession,
        handleBiometricLogin,
        handleLogout,
        handleResetSession,
        executeResetSession,
        performBiometricOrPasswordCheck,
        performBiometricAndPasswordCheck,
        unlockedAt,
        unlockMethod,
        lastUnlock,
        unlockHistory,
        refreshUnlockHistory,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
