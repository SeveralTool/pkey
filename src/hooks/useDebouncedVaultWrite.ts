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
import { writeDatabaseToDisk as writeDbService } from '../services/storage';
import { notifyWebClients } from '../services/webSyncNotify';
import { syncAutofillCache } from '../services/autofill';
import { commitVault } from '../services/vaultSecrets';
import { notifications } from '../notifications/notificationRef';
import { WRITE_DEBOUNCE_MS } from '../constants/writeDebounce';

let flushPendingWriteRef: (() => Promise<void>) | null = null;

/** Flushes any debounced vault write; safe to call before DatabaseProvider mounts. */
export const flushPendingDatabaseWrite = (): Promise<void> =>
  flushPendingWriteRef?.() ?? Promise.resolve();

export function useDebouncedVaultWrite(
  opts: Readonly<{
    isLogged: boolean;
    db: EncryptedDatabase;
    masterPassword: string;
    setDb: Dispatch<SetStateAction<EncryptedDatabase>>;
    getT: () => LocaleStrings;
  }>
): {
  writeDatabaseToDisk: (newDb: EncryptedDatabase, immediate?: boolean) => Promise<void>;
  flushWriteDatabaseToDisk: () => Promise<void>;
  lastPersistedDbRef: MutableRefObject<EncryptedDatabase | null>;
} {
  const { isLogged, db, masterPassword, setDb, getT } = opts;
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
    if (!pendingDbRef.current && db?.version && !lastPersistedDbRef.current) {
      lastPersistedDbRef.current = db;
    }
  }, [isLogged, db]);

  const flushWriteDatabaseToDisk = useCallback(async () => {
    const pending = pendingDbRef.current;
    if (!pending) return;
    pendingDbRef.current = null;
    if (writeDebounceRef.current) {
      clearTimeout(writeDebounceRef.current);
      writeDebounceRef.current = null;
    }
    try {
      const { disk } = commitVault(pending);
      await writeDbService(disk, masterPasswordRef.current);
      lastPersistedDbRef.current = disk;
      notifyWebClients();
      void syncAutofillCache(disk.cards ?? []);
    } catch (err) {
      console.error('[DatabaseContext] writeDatabaseToDisk failed:', err);
      if (lastPersistedDbRef.current) {
        setDb(lastPersistedDbRef.current);
      }
      const t = getT();
      notifications.alert({
        title: t.filesystem_error_title,
        message: t.filesystem_error_body,
        variant: 'error',
      });
    }
  }, [setDb, getT]);

  useEffect(() => {
    flushPendingWriteRef = flushWriteDatabaseToDisk;
    return () => {
      flushPendingWriteRef = null;
    };
  }, [flushWriteDatabaseToDisk]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        void flushWriteDatabaseToDisk();
      }
    });
    return () => sub.remove();
  }, [flushWriteDatabaseToDisk]);

  const writeDatabaseToDisk = useCallback(
    async (newDb: EncryptedDatabase, immediate = false) => {
      const { ui, disk } = commitVault(newDb);
      pendingDbRef.current = disk;
      setDb(ui);
      notifyWebClients();
      if (writeDebounceRef.current) clearTimeout(writeDebounceRef.current);
      if (immediate) {
        await flushWriteDatabaseToDisk();
        return;
      }
      writeDebounceRef.current = setTimeout(() => {
        void flushWriteDatabaseToDisk();
      }, WRITE_DEBOUNCE_MS);
    },
    [flushWriteDatabaseToDisk, setDb]
  );

  return { writeDatabaseToDisk, flushWriteDatabaseToDisk, lastPersistedDbRef };
}
