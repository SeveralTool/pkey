/**
 * @fileoverview Shared mutable app state (vault snapshot, auth flags, busy overlays, UI fields).
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { InteractionManager } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { EncryptedDatabase } from '../types';
import { checkBiometrics } from '../services/biometrics';
import { checkDatabaseExists } from '../services/storage';
import { createEmptySessionDatabase } from '../utils/emptySessionDatabase';
import {
  getMasterPassword,
  setMasterPassword as setMasterPasswordVault,
  subscribeMasterPassword,
} from '../services/masterPasswordVault';

const INITIAL_DB: EncryptedDatabase = createEmptySessionDatabase();

/** Modal prompt owned by auth/database flows (password confirm, backup decrypt). */
export interface CustomPromptState {
  visible: boolean;
  title: string;
  message: string;
  secure: boolean;
  busyMessage: string;
  /** Inline error shown inside the prompt (wrong password, etc.). */
  error?: string;
  placeholder?: string;
  maxLength?: number;
  onConfirm: (input: string) => void;
}

/** Filter applied when navigating from Stats metrics into the Cards tab. */
export type CardsListFilterKind =
  | 'duplicates'
  | 'weak'
  | 'stale'
  | 'no_otp'
  | 'empty_username'
  | 'empty_password'
  | 'empty_link'
  | 'untagged'
  | 'password'
  | 'secret_phrase'
  | 'note'
  | 'reused_username'
  | 'hibp_checked'
  | 'hibp_breached';

export type CardsListFilter = {
  kind: CardsListFilterKind;
  /** Precomputed ids (e.g. zxcvbn weak) for consistency with Stats. */
  cardIds?: readonly string[];
} | null;

/** Boot-time vault existence check: unknown vs resolved vs I/O failure. */
export type SessionGate = 'pending' | 'ready' | 'error';

export interface CoreStateData {
  isLogged: boolean;
  setIsLogged: React.Dispatch<React.SetStateAction<boolean>>;
  hasSession: boolean;
  setHasSession: React.Dispatch<React.SetStateAction<boolean>>;
  /** `pending` until disk check finishes; `error` must not imply a new install. */
  sessionGate: SessionGate;
  setSessionGate: React.Dispatch<React.SetStateAction<SessionGate>>;
  /** Re-run vault existence check after an I/O error (splash already hidden). */
  retrySessionCheck: () => Promise<void>;
  customPrompt: CustomPromptState;
  setCustomPrompt: React.Dispatch<React.SetStateAction<CustomPromptState>>;
  customPromptInput: string;
  setCustomPromptInput: React.Dispatch<React.SetStateAction<string>>;
  masterPassword: string;
  setMasterPassword: React.Dispatch<React.SetStateAction<string>>;
  repeatPassword: string;
  setRepeatPassword: React.Dispatch<React.SetStateAction<string>>;
  validationError: string;
  setValidationError: React.Dispatch<React.SetStateAction<string>>;
  /** True while a CPU-heavy auth operation (key derivation) is running. */
  authBusy: boolean;
  setAuthBusy: React.Dispatch<React.SetStateAction<boolean>>;
  /** When set, shows the delete-all confirmation modal with this card count. */
  deleteAllConfirmCount: number | null;
  setDeleteAllConfirmCount: React.Dispatch<React.SetStateAction<number | null>>;
  /** When true, shows the reset-session confirmation modal (danger zone). */
  resetSessionConfirmVisible: boolean;
  setResetSessionConfirmVisible: React.Dispatch<React.SetStateAction<boolean>>;
  /** Global blocking message for file pick / decrypt import flows. */
  operationBusy: string | null;
  setOperationBusy: React.Dispatch<React.SetStateAction<string | null>>;
  /** Status line shown in the import wizard while importing. */
  importStatusMessage: string | null;
  setImportStatusMessage: React.Dispatch<React.SetStateAction<string | null>>;
  db: EncryptedDatabase;
  setDb: React.Dispatch<React.SetStateAction<EncryptedDatabase>>;
  /** Always-current db snapshot for sync server (updated synchronously with setDb). */
  dbRef: React.MutableRefObject<EncryptedDatabase>;
  /** `null` until the OS biometrics probe resolves. */
  biometricsAvailable: boolean | null;
  setBiometricsAvailable: React.Dispatch<React.SetStateAction<boolean | null>>;
}

const CoreStateContext = createContext<CoreStateData>({} as CoreStateData);

/** Consumes the shared core state store from `CoreStateProvider`. */
export const useCoreState = () => useContext(CoreStateContext);

/** Holds cross-cutting React state shared by auth, database, UI, and sync providers. */
export const CoreStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLogged, setIsLogged] = useState<boolean>(false);
  const [hasSession, setHasSession] = useState<boolean>(false);
  const [sessionGate, setSessionGate] = useState<SessionGate>('pending');

  const [customPrompt, setCustomPrompt] = useState<CustomPromptState>({
    visible: false,
    title: '',
    message: '',
    secure: true,
    busyMessage: '',
    onConfirm: (_t: string) => {},
  });
  const [customPromptInput, setCustomPromptInput] = useState<string>('');

  // The raw master password lives in the isolated vault module — see
  // services/masterPasswordVault.ts and audit finding A8. The React tree only
  // observes it through useSyncExternalStore so it never enters a devtools
  // props/state dump.
  const masterPassword = useSyncExternalStore(
    subscribeMasterPassword,
    getMasterPassword,
    getMasterPassword
  );
  const setMasterPassword = useCallback<React.Dispatch<React.SetStateAction<string>>>((action) => {
    const next =
      typeof action === 'function'
        ? (action as (prev: string) => string)(getMasterPassword())
        : action;
    setMasterPasswordVault(next);
  }, []);
  const [repeatPassword, setRepeatPassword] = useState<string>('');
  const [validationError, setValidationError] = useState<string>('');
  const [authBusy, setAuthBusy] = useState<boolean>(false);
  const [deleteAllConfirmCount, setDeleteAllConfirmCount] = useState<number | null>(null);
  const [resetSessionConfirmVisible, setResetSessionConfirmVisible] = useState<boolean>(false);
  const [operationBusy, setOperationBusy] = useState<string | null>(null);
  const [importStatusMessage, setImportStatusMessage] = useState<string | null>(null);

  const [db, setDbState] = useState<EncryptedDatabase>(INITIAL_DB);
  const dbRef = useRef<EncryptedDatabase>(INITIAL_DB);

  const setDb = useCallback<React.Dispatch<React.SetStateAction<EncryptedDatabase>>>((action) => {
    const prev = dbRef.current;
    const next = typeof action === 'function' ? action(prev) : action;
    dbRef.current = next;
    setDbState(next);
  }, []);

  const [biometricsAvailable, setBiometricsAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const isAvailable = await checkBiometrics();
      setBiometricsAvailable(isAvailable);
    })();
  }, []);

  const applySessionCheckResult = useCallback(async (): Promise<SessionGate> => {
    try {
      const exists = await checkDatabaseExists();
      setHasSession(exists);
      setSessionGate('ready');
      return 'ready';
    } catch (err) {
      console.error('[CoreState] session check failed:', err);
      setSessionGate('error');
      return 'error';
    }
  }, []);

  const retrySessionCheck = useCallback(async () => {
    setSessionGate('pending');
    await applySessionCheckResult();
  }, [applySessionCheckResult]);

  useEffect(() => {
    let active = true;
    let hideTask: { cancel?: () => void } | undefined;
    (async () => {
      try {
        const exists = await checkDatabaseExists();
        if (!active) return;
        setHasSession(exists);
        setSessionGate('ready');
      } catch (err) {
        console.error('[CoreState] session check failed:', err);
        if (!active) return;
        setSessionGate('error');
      }
      if (!active) return;
      hideTask = InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (active) void SplashScreen.hideAsync();
          });
        });
      });
    })();
    return () => {
      active = false;
      hideTask?.cancel?.();
    };
  }, []);

  // Memoized so consumers only re-render when a field they read actually
  // changes reference; an inline object here would invalidate every consumer
  // on every provider render.
  const value = useMemo(
    () => ({
      isLogged,
      setIsLogged,
      hasSession,
      setHasSession,
      sessionGate,
      setSessionGate,
      retrySessionCheck,
      customPrompt,
      setCustomPrompt,
      customPromptInput,
      setCustomPromptInput,
      masterPassword,
      setMasterPassword,
      repeatPassword,
      setRepeatPassword,
      validationError,
      setValidationError,
      authBusy,
      setAuthBusy,
      deleteAllConfirmCount,
      setDeleteAllConfirmCount,
      resetSessionConfirmVisible,
      setResetSessionConfirmVisible,
      operationBusy,
      setOperationBusy,
      importStatusMessage,
      setImportStatusMessage,
      db,
      setDb,
      dbRef,
      biometricsAvailable,
      setBiometricsAvailable,
    }),
    [
      isLogged,
      hasSession,
      sessionGate,
      retrySessionCheck,
      customPrompt,
      customPromptInput,
      masterPassword,
      repeatPassword,
      validationError,
      authBusy,
      deleteAllConfirmCount,
      resetSessionConfirmVisible,
      operationBusy,
      importStatusMessage,
      db,
      setDb,
      biometricsAvailable,
    ]
  );

  return <CoreStateContext.Provider value={value}>{children}</CoreStateContext.Provider>;
};
