/**
 * @fileoverview Debounced encrypted vault persistence + flush-on-background.
 */
import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { AppState } from 'react-native';
import type { EncryptedDatabase } from '../types';
import type { LocaleStrings } from '../constants/localization';
import { notifyWebClients } from '../services/webSyncNotify';
import { syncAutofillCache } from '../services/autofill';
import {
  getLastPersistedDisk,
  persistVaultDisk,
  stageVault,
  vaultForSync,
} from '../services/vaultPersistence';
import {
  registerVaultPersist,
  unregisterVaultPersist,
  type VaultPersistOptions,
} from '../services/vaultPersist';
import { rememberPublicUiFromSettings } from '../utils/publicUiPrefs';
import { notifications } from '../notifications/notificationRef';
import { WRITE_DEBOUNCE_MS } from '../constants/writeDebounce';

let flushPendingWriteRef: (() => Promise<boolean>) | null = null;
let inflightFlush: Promise<boolean> | null = null;

/**
 * Flushes any debounced vault write; safe to call before DatabaseProvider mounts.
 *
 * A flush already writing an older snapshot does not count as this call.
 * The registered writer waits for that pass and then writes anything staged
 * in the meantime. Resolves `true` when nothing was pending or the latest
 * snapshot reached disk, `false` when that latest write failed.
 */
export const flushPendingDatabaseWrite = (): Promise<boolean> => {
  if (flushPendingWriteRef) return flushPendingWriteRef();
  return inflightFlush ?? Promise.resolve(true);
};

export function useDebouncedVaultWrite(
  opts: Readonly<{
    isLogged: boolean;
    masterPassword: string;
    setDb: Dispatch<SetStateAction<EncryptedDatabase>>;
    getT: () => LocaleStrings;
  }>
): {
  /**
   * Stages `newDb` and persists it (debounced, or immediately). Resolves `true`
   * when the write is staged (debounced) or that snapshot reached disk
   * (immediate); `false` when an immediate write failed — the UI state was
   * restored and an alert shown, unless a newer snapshot was already staged.
   */
  writeDatabaseToDisk: (
    newDb: EncryptedDatabase,
    immediate?: boolean,
    opts?: VaultPersistOptions
  ) => Promise<boolean>;
  flushWriteDatabaseToDisk: () => Promise<boolean>;
  lastPersistedDbRef: MutableRefObject<EncryptedDatabase | null>;
} {
  const { isLogged, masterPassword, setDb, getT } = opts;
  const writeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDbRef = useRef<EncryptedDatabase | null>(null);
  const lastPersistedDbRef = useRef<EncryptedDatabase | null>(null);
  const masterPasswordRef = useRef(masterPassword);
  masterPasswordRef.current = masterPassword;

  useEffect(() => {
    if (!isLogged) {
      lastPersistedDbRef.current = null;
      pendingDbRef.current = null;
      if (writeDebounceRef.current) {
        clearTimeout(writeDebounceRef.current);
        writeDebounceRef.current = null;
      }
      return;
    }
    if (!lastPersistedDbRef.current) {
      const noted = getLastPersistedDisk();
      if (noted) lastPersistedDbRef.current = noted;
    }
  }, [isLogged]);

  const flushWriteDatabaseToDisk = useCallback(
    (opts?: VaultPersistOptions): Promise<boolean> => {
      if (inflightFlush) {
        // The in-flight pass already copied its snapshot. A newer pending
        // vault must be written before this call can report success — callers
        // such as device-secret unbind delete the hardware secret when the
        // boolean is true.
        return inflightFlush.then((ok) => {
          if (!pendingDbRef.current) return ok;
          return flushWriteDatabaseToDisk(opts);
        });
      }
      const notify = opts?.notify !== false;
      const run = (async (): Promise<boolean> => {
        const pending = pendingDbRef.current;
        if (!pending) return true;
        pendingDbRef.current = null;
        if (writeDebounceRef.current) {
          clearTimeout(writeDebounceRef.current);
          writeDebounceRef.current = null;
        }
        try {
          await persistVaultDisk(pending, masterPasswordRef.current);
          lastPersistedDbRef.current = pending;
          void syncAutofillCache(pending.cards ?? []);
          return true;
        } catch (err) {
          console.error('[DatabaseContext] writeDatabaseToDisk failed:', err);
          // A newer snapshot was staged while this one was writing. Leave the
          // UI on that snapshot; the follow-up flush reports its own result.
          if (pendingDbRef.current) return false;
          // A keystroke stages live disk without entering the debounce queue.
          // That edit is newer than the snapshot this flush failed to write.
          const live = vaultForSync();
          if (!live || live === pending) {
            const previous = lastPersistedDbRef.current ?? getLastPersistedDisk();
            if (previous) {
              const reverted = stageVault(previous);
              lastPersistedDbRef.current = previous;
              setDb(reverted.ui);
              if (notify) notifyWebClients(reverted.disk);
            }
          } else if (notify) {
            notifyWebClients(live);
          }
          const t = getT();
          notifications.alert({
            title: t.filesystem_error_title,
            message: t.filesystem_error_body,
            variant: 'error',
          });
          return false;
        }
      })();
      inflightFlush = run.finally(() => {
        inflightFlush = null;
      });
      return inflightFlush;
    },
    [setDb, getT]
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        void flushWriteDatabaseToDisk();
      }
    });
    return () => sub.remove();
  }, [flushWriteDatabaseToDisk]);

  const writeDatabaseToDisk = useCallback(
    async (
      newDb: EncryptedDatabase,
      immediate = false,
      opts?: VaultPersistOptions
    ): Promise<boolean> => {
      const notify = opts?.notify !== false;
      const { ui, disk } = stageVault(newDb);
      pendingDbRef.current = disk;
      setDb(ui);
      rememberPublicUiFromSettings(ui.settings);
      if (notify) notifyWebClients(disk);
      if (writeDebounceRef.current) clearTimeout(writeDebounceRef.current);
      if (immediate) {
        return flushWriteDatabaseToDisk({ notify });
      }
      writeDebounceRef.current = setTimeout(() => {
        void flushWriteDatabaseToDisk();
      }, WRITE_DEBOUNCE_MS);
      return true;
    },
    [flushWriteDatabaseToDisk, setDb]
  );

  useEffect(() => {
    flushPendingWriteRef = () => flushWriteDatabaseToDisk();
    registerVaultPersist({
      schedule: (db, immediate, opts) => writeDatabaseToDisk(db, immediate, opts),
      flush: () => flushWriteDatabaseToDisk(),
    });
    return () => {
      flushPendingWriteRef = null;
      unregisterVaultPersist();
    };
  }, [flushWriteDatabaseToDisk, writeDatabaseToDisk]);

  return { writeDatabaseToDisk, flushWriteDatabaseToDisk, lastPersistedDbRef };
}
