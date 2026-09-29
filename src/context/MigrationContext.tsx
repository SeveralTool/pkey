/**
 * @fileoverview State machine for one-shot device-to-device migration.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCoreState } from './CoreStateContext';
import { useAuth } from './AuthContext';
import { useSync } from './SyncContext';
import { checkDatabaseExists, destroyDatabase } from '../services/storage';
import { destroyMasterKey } from '../services/biometrics';
import { getLocalIp } from '../services/networkUtils';
import { MigrationReceiverServer } from '../services/migrationReceiverServer';
import { MigrationSenderCallbackServer } from '../services/migrationSenderCallbackServer';
import {
  MigrationDiscovery,
  getDefaultDeviceName,
  isMigrationDiscoveryAvailable,
} from '../services/migrationDiscovery';
import { sendMigration, requestSenderWipe } from '../services/migrationSender';
import {
  buildMigrationQrPayload,
  DiscoveredMigrationDevice,
  MigrationPhase,
  MigrationRole,
  MIGRATION_PORT,
  normalizePairingCode,
  parseMigrationQrPayload,
} from '../services/migrationProtocol';
import {
  MigrationSendError,
  coerceMigrationSendError,
  getUnknownErrorCode,
  translateMigrationSendError,
} from '../services/migrationErrors';
import { getLocale } from '../constants/localization';
import { getOrCreateDeviceId } from '../services/deviceId';
import {
  commitPendingMigration,
  discardPendingMigration,
  hasPendingMigration,
  MigrationFinalizeTarget,
  readPendingMigrationMeta,
  stagePendingMigration,
} from '../services/migrationPendingVault';
import { notifications } from '../notifications/notificationRef';

const SK_LEGACY_SAT_IP = '@pkey/sync_satellite_ip';
const SK_LEGACY_SAT_PORT = '@pkey/sync_satellite_port';
const SK_LEGACY_SAT_FP = '@pkey/sync_satellite_fp';
const SK_LEGACY_ROLE = '@pkey/sync_role';

export type MigrationContextData = Readonly<{
  migrationRole: MigrationRole;
  migrationPhase: MigrationPhase;
  migrationProgress: number;
  migrationMessage: string | null;
  migrationError: string | null;
  migrationVisible: boolean;
  discoveredDevices: readonly DiscoveredMigrationDevice[];
  receiverQrPayload: string | null;
  receiverIp: string | null;
  receiverSessionId: string | null;
  receiverPairingSecret: string | null;
  receiverFingerprint: string | null;
  senderFingerprint: string | null;
  receiverTlsFingerprint: string | null;
  senderTlsFingerprint: string | null;
  receiverPort: number;
  nativeMigrationAvailable: boolean;
  mdnsAvailable: boolean;
  cardCountForMigration: number;
  openMigrationSend: () => void;
  openMigrationReceive: () => void;
  closeMigration: () => void;
  selectDeviceAndMigrate: (
    device: DiscoveredMigrationDevice,
    pairingSecret?: string
  ) => Promise<void>;
  connectFromQr: (qr: string) => Promise<void>;
  connectManual: (ip: string, port: number, pairingSecret: string) => Promise<void>;
  finalizeMigration: () => void;
  /** Discard staged vault and restore pre-migration local state (receiver). */
  abortReceivedMigration: () => void;
  cancelMigration: () => void;
  /** True while a staged vault awaits finalize (blocks unlocking received data). */
  incompleteMigrationPending: boolean;
}>;

const MigrationContext = createContext<MigrationContextData>({} as MigrationContextData);

/** Consumes one-shot device-to-device migration state and actions. */
export const useMigration = () => useContext(MigrationContext);

/** Runs receive/send migration flows over the LAN migration protocol. */
export const MigrationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    db,
    setDb,
    setHasSession,
    setSessionGate,
    setIsLogged,
    isLogged,
    setMasterPassword,
    setRepeatPassword,
  } = useCoreState();

  const { performBiometricOrPasswordCheck } = useAuth();

  const { webServerEnabled, disableWebServer, enableWebServer } = useSync();
  const webWasEnabledRef = useRef(false);

  const pauseWebServerForMigration = useCallback(() => {
    if (webServerEnabled) {
      webWasEnabledRef.current = true;
      disableWebServer();
    }
  }, [webServerEnabled, disableWebServer]);

  const restoreWebServerAfterMigration = useCallback(() => {
    if (webWasEnabledRef.current) {
      webWasEnabledRef.current = false;
      enableWebServer();
    }
  }, [enableWebServer]);

  const [migrationRole, setMigrationRole] = useState<MigrationRole>('idle');
  const [migrationPhase, setMigrationPhase] = useState<MigrationPhase>('idle');
  const [migrationProgress, setMigrationProgress] = useState(0);
  const [migrationMessage, setMigrationMessage] = useState<string | null>(null);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [migrationVisible, setMigrationVisible] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredMigrationDevice[]>([]);
  const [receiverQrPayload, setReceiverQrPayload] = useState<string | null>(null);
  const [receiverIp, setReceiverIp] = useState<string | null>(null);
  const [receiverSessionId, setReceiverSessionId] = useState<string | null>(null);
  const [receiverPairingSecret, setReceiverPairingSecret] = useState<string | null>(null);
  const [receiverFingerprint, setReceiverFingerprint] = useState<string | null>(null);
  const [senderFingerprint, setSenderFingerprint] = useState<string | null>(null);
  const [receiverTlsFingerprint, setReceiverTlsFingerprint] = useState<string | null>(null);
  const [senderTlsFingerprint, setSenderTlsFingerprint] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState('');
  const [incompleteMigrationPending, setIncompleteMigrationPending] = useState(false);
  const pendingTargetRef = useRef<MigrationFinalizeTarget | null>(null);

  const receiverRef = useRef<MigrationReceiverServer | null>(null);
  const senderCallbackRef = useRef<MigrationSenderCallbackServer | null>(null);
  const discoveryRef = useRef<MigrationDiscovery | null>(null);
  const sendResultRef = useRef<{ migrationId: string; senderWipeProof: string } | null>(null);

  const nativeMigrationAvailable = MigrationReceiverServer.isAvailable();
  const mdnsAvailable = isMigrationDiscoveryAvailable();

  const getT = () => getLocale(db.settings?.language);

  const requiresMigrationAuth = useCallback(
    () => !!db.passwordHash && isLogged,
    [db.passwordHash, isLogged]
  );

  const confirmMigrationAccess = useCallback(
    (prompt: string, onGranted: () => void) => {
      if (!requiresMigrationAuth()) {
        onGranted();
        return;
      }
      performBiometricOrPasswordCheck(onGranted, prompt);
    },
    [requiresMigrationAuth, performBiometricOrPasswordCheck]
  );

  useEffect(() => {
    getOrCreateDeviceId().then(setDeviceId);
    // Clean legacy satellite keys on upgrade
    AsyncStorage.multiRemove([
      SK_LEGACY_SAT_IP,
      SK_LEGACY_SAT_PORT,
      SK_LEGACY_SAT_FP,
      SK_LEGACY_ROLE,
    ]).catch(() => {});

    // Resume incomplete receive: staged vault must not be unlockable until finalize/abort.
    void (async () => {
      const pending = await hasPendingMigration();
      setIncompleteMigrationPending(pending);
      if (!pending) return;
      const meta = await readPendingMigrationMeta();
      pendingTargetRef.current = meta?.target || null;
      setMigrationVisible(true);
      setMigrationRole('receiving');
      setMigrationPhase('ready_to_finalize');
      setMigrationProgress(100);
      setMigrationError(getT().migration_incomplete_resume_hint);
    })();
  }, []);

  const setPhase = useCallback(
    (phase: MigrationPhase, progress: number, message?: string | null) => {
      setMigrationPhase(phase);
      setMigrationProgress(progress);
      if (message !== undefined) setMigrationMessage(message);
    },
    []
  );

  const cleanup = useCallback(() => {
    receiverRef.current?.stop();
    receiverRef.current = null;
    senderCallbackRef.current?.stop();
    senderCallbackRef.current = null;
    discoveryRef.current?.stopScan();
    discoveryRef.current?.unpublish();
    discoveryRef.current = null;
    sendResultRef.current = null;
    restoreWebServerAfterMigration();
  }, [restoreWebServerAfterMigration]);

  const closeMigration = useCallback(() => {
    cleanup();
    setMigrationVisible(false);
    setMigrationRole('idle');
    setMigrationPhase('idle');
    setMigrationProgress(0);
    setMigrationMessage(null);
    setMigrationError(null);
    setDiscoveredDevices([]);
    setReceiverQrPayload(null);
    setReceiverIp(null);
    setReceiverSessionId(null);
    setReceiverPairingSecret(null);
    setReceiverFingerprint(null);
    setSenderFingerprint(null);
    setReceiverTlsFingerprint(null);
    setSenderTlsFingerprint(null);
  }, [cleanup]);

  const logoutToLoginShell = useCallback(async () => {
    await destroyMasterKey();
    setIsLogged(false);
    setMasterPassword('');
    setRepeatPassword('');
    setDb((prev) => ({ ...prev, cards: [], passwordHash: '' }));
  }, [setIsLogged, setMasterPassword, setRepeatPassword, setDb]);

  /**
   * Receiver abort: discard staged vault, keep previous live DB (if any), go to login.
   */
  const abortReceivedMigration = useCallback(() => {
    const t = getT();
    notifications.alert({
      title: t.migration_abort_receive_title,
      message: t.migration_abort_receive_body,
      variant: 'warning',
      actions: [
        { text: t.cancel_button, style: 'cancel' },
        {
          text: t.migration_abort_receive_confirm,
          style: 'destructive',
          onPress: () => {
            void (async () => {
              receiverRef.current?.stop();
              discoveryRef.current?.unpublish();
              await discardPendingMigration();
              pendingTargetRef.current = null;
              setIncompleteMigrationPending(false);
              await logoutToLoginShell();
              try {
                const exists = await checkDatabaseExists();
                setHasSession(exists);
                setSessionGate('ready');
              } catch (err) {
                console.error('[Migration] session check after abort failed:', err);
                setSessionGate('error');
              }
              closeMigration();
              notifications.alert({
                title: t.migration_abort_receive_done_title,
                message: t.migration_abort_receive_done_body,
                variant: 'info',
              });
            })();
          },
        },
      ],
    });
  }, [closeMigration, logoutToLoginShell, setHasSession, setSessionGate, db.settings?.language]);

  const cancelMigration = useCallback(() => {
    const t = getT();
    const phase = migrationPhase;

    if (phase === 'ready_to_finalize' || phase === 'finalizing') {
      if (migrationRole === 'receiving') {
        abortReceivedMigration();
        return;
      }
      if (migrationRole === 'sending') {
        notifications.alert({
          title: t.migration_cancel_send_title,
          message: t.migration_cancel_send_body,
          variant: 'warning',
          actions: [
            { text: t.cancel_button, style: 'cancel' },
            {
              text: t.migration_keep_local_btn,
              style: 'destructive',
              onPress: () => {
                closeMigration();
                notifications.alert({
                  title: t.migration_cancel_send_done_title,
                  message: t.migration_cancel_send_done_body,
                  variant: 'info',
                });
              },
            },
          ],
        });
        return;
      }
    }

    if (phase === 'transferring' || phase === 'authenticating' || phase === 'preparing') {
      notifications.alert({
        title: t.migration_cancel_title,
        message: t.migration_cancel_body,
        variant: 'warning',
        actions: [
          { text: t.cancel_button, style: 'cancel' },
          { text: t.proceed_button, style: 'destructive', onPress: closeMigration },
        ],
      });
      return;
    }
    closeMigration();
  }, [
    migrationPhase,
    migrationRole,
    closeMigration,
    abortReceivedMigration,
    db.settings?.language,
  ]);

  /** After wipe ACK: commit staged vault to live DB and send user to login. */
  const finishReceiverLocally = useCallback(async () => {
    const t = getT();
    receiverRef.current?.stop();
    discoveryRef.current?.unpublish();
    await commitPendingMigration();
    pendingTargetRef.current = null;
    setIncompleteMigrationPending(false);
    await logoutToLoginShell();
    setHasSession(true);
    closeMigration();
    notifications.alert({
      title: t.migration_receive_done_title,
      message: t.migration_receive_done_body,
      variant: 'success',
    });
  }, [closeMigration, logoutToLoginShell, setHasSession, db.settings?.language]);

  /**
   * Stage received encrypted vault — do NOT overwrite live DB until finalize succeeds.
   */
  const applyReceivedPayload = useCallback(
    async (encryptedPayload: string, cardCount: number) => {
      const target = receiverRef.current?.getFinalizeTarget() || null;
      const mapped: MigrationFinalizeTarget | null = target
        ? {
            senderIp: target.senderIp,
            senderIpAlternates: target.senderIpAlternates || [],
            senderCallbackPort: target.senderCallbackPort,
            migrationId: target.migrationId,
            pairingSecret: target.pairingSecret,
            sessionId: target.sessionId,
            senderWipeProof: target.senderWipeProof,
          }
        : null;
      await stagePendingMigration(encryptedPayload, cardCount, mapped);
      pendingTargetRef.current = mapped;
      setIncompleteMigrationPending(true);
      await destroyMasterKey();
      setPhase('applying_settings', 96, String(cardCount));
    },
    [setPhase]
  );

  const formatMigrationError = (e: unknown, fallback: string): string => {
    if (e instanceof MigrationSendError) {
      return translateMigrationSendError(e, getT() as Record<string, string>);
    }
    const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
    const code = getUnknownErrorCode(e);
    if (code === 'EADDRINUSE' || /address already in use/i.test(msg)) {
      return getT().migration_receiver_port_in_use;
    }
    if (/not available/i.test(msg)) {
      return getT().migration_dev_build_required;
    }
    return msg || fallback;
  };

  const startReceiving = useCallback(async () => {
    cleanup();
    await discardPendingMigration();
    pendingTargetRef.current = null;
    setIncompleteMigrationPending(false);
    setMigrationVisible(true);
    setMigrationRole('receiving');
    setMigrationError(null);
    setReceiverQrPayload(null);
    setReceiverIp(null);
    setReceiverTlsFingerprint(null);
    setPhase('discovering', 0);

    pauseWebServerForMigration();

    const receiver = new MigrationReceiverServer();
    receiver.setDeviceName(getDefaultDeviceName());
    receiver.setLocalPasswordHash(isLogged && db.passwordHash ? db.passwordHash : null);
    receiver.setCallbacks({
      onPhaseChange: (phase, progress, message) => setPhase(phase, progress, message || null),
      onMigrationComplete: applyReceivedPayload,
      getSenderIpForFinalize: () => receiver.getFinalizeTarget()?.senderIp || null,
    });
    receiver.prepareSession();
    receiverRef.current = receiver;
    setReceiverSessionId(receiver.currentSessionId);
    setReceiverPairingSecret(receiver.currentPairingSecret);
    setReceiverFingerprint(receiver.channelFingerprint);

    try {
      // TLS RSA keygen inside start() is sync and can freeze JS for seconds on
      // older phones. Wait one frame so pairing + QR skeleton commit before that.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => setTimeout(resolve, 16));
      });
      if (receiverRef.current !== receiver) return;

      const ipPromise = getLocalIp();
      await receiver.start(MIGRATION_PORT);
      if (receiverRef.current !== receiver) {
        receiver.stop();
        return;
      }
      const ip = await ipPromise;
      if (receiverRef.current !== receiver) return;

      setReceiverIp(ip);
      setReceiverTlsFingerprint(receiver.tlsFingerprint || null);
      if (ip) {
        setReceiverQrPayload(
          buildMigrationQrPayload(
            ip,
            MIGRATION_PORT,
            receiver.currentSessionId,
            receiver.currentPairingSecret
          )
        );
      }
      if (mdnsAvailable) {
        try {
          const discovery = new MigrationDiscovery();
          discovery.publish(
            getDefaultDeviceName(),
            receiver.currentSessionId,
            receiver.channelFingerprint,
            MIGRATION_PORT
          );
          discoveryRef.current = discovery;
        } catch {
          // mDNS is optional — QR and manual IP still work
        }
      }
      setPhase('discovering', 10);
    } catch (e: unknown) {
      if (receiverRef.current === receiver) receiverRef.current = null;
      receiver.stop();
      setReceiverQrPayload(null);
      setReceiverIp(null);
      setReceiverSessionId(null);
      setReceiverPairingSecret(null);
      setReceiverFingerprint(null);
      setReceiverTlsFingerprint(null);
      setMigrationError(formatMigrationError(e, getT().migration_receiver_start_failed));
      setPhase('error', 0);
    }
  }, [
    cleanup,
    applyReceivedPayload,
    mdnsAvailable,
    setPhase,
    db.settings?.language,
    pauseWebServerForMigration,
    isLogged,
    db.passwordHash,
  ]);

  const startSendingDiscovery = useCallback(async () => {
    cleanup();
    setMigrationVisible(true);
    setMigrationRole('sending');
    setMigrationError(null);
    setPhase('discovering', 0);
    setDiscoveredDevices([]);

    pauseWebServerForMigration();

    if (mdnsAvailable) {
      const discovery = new MigrationDiscovery((devices) => setDiscoveredDevices(devices));
      discoveryRef.current = discovery;
      discovery.startScan();
    }
    setPhase('discovering', 5);
  }, [cleanup, mdnsAvailable, setPhase, pauseWebServerForMigration]);

  const openMigrationReceive = useCallback(() => {
    const t = getT();
    confirmMigrationAccess(t.migration_auth_receive, () => {
      if (isLogged) {
        notifications.alert({
          title: t.migration_override_title,
          message: t.migration_override_body,
          variant: 'warning',
          actions: [
            { text: t.cancel_button, style: 'cancel' },
            {
              text: t.proceed_button,
              style: 'destructive',
              onPress: () => void startReceiving(),
            },
          ],
        });
        return;
      }
      void startReceiving();
    });
  }, [confirmMigrationAccess, isLogged, startReceiving, db.settings?.language]);

  const openMigrationSend = useCallback(() => {
    const t = getT();
    if (!db.passwordHash) {
      notifications.alert({
        title: t.migration_phase_error,
        message: t.migration_login_required,
        variant: 'error',
      });
      return;
    }
    confirmMigrationAccess(t.migration_auth_send, startSendingDiscovery);
  }, [db.passwordHash, confirmMigrationAccess, startSendingDiscovery, db.settings?.language]);

  const runSendToDevice = useCallback(
    async (device: DiscoveredMigrationDevice) => {
      // Master password plaintext is cleared after unlock by design; migration only needs passwordHash.
      if (!db.passwordHash) {
        setMigrationError(getT().migration_send_failed);
        return;
      }
      setPhase('connecting', 8, device.name);

      const callbackServer = new MigrationSenderCallbackServer();

      try {
        const result = await sendMigration({
          device,
          passwordHash: db.passwordHash,
          sourceId: deviceId || 'sender',
          cardCount: db.cards?.length || 0,
          onPhaseChange: (phase, progress, message) => {
            setPhase(phase as MigrationPhase, progress, message || null);
          },
          onFingerprint: (fp) => setSenderFingerprint(fp),
          onTlsFingerprint: (fp) => setSenderTlsFingerprint(fp),
        });

        sendResultRef.current = {
          migrationId: result.migrationId,
          senderWipeProof: result.senderWipeProof,
        };

        await callbackServer.start(
          {
            pairingSecret: result.pairingSecret,
            receiverSessionId: result.receiverSessionId,
            migrationId: result.migrationId,
            senderSessionId: result.senderSessionId,
            expectedWipeProof: result.senderWipeProof,
          },
          async (mid) => {
            if (mid !== result.migrationId) return;
            try {
              await destroyDatabase();
              await destroyMasterKey();
              setDb((prev) => ({ ...prev, cards: [], passwordHash: '' }));
              setHasSession(false);
              setIsLogged(false);
              setMasterPassword('');
              setRepeatPassword('');
            } finally {
              closeMigration();
              notifications.alert({
                title: getT().migration_wipe_done_title,
                message: getT().migration_wipe_done_body,
                variant: 'success',
              });
            }
          }
        );
        senderCallbackRef.current = callbackServer;

        setPhase('ready_to_finalize', 95, device.name);
      } catch (e: unknown) {
        callbackServer.stop();
        const sendErr = coerceMigrationSendError(e);
        if (sendErr) {
          setMigrationError(translateMigrationSendError(sendErr, getT() as Record<string, string>));
        } else {
          setMigrationError(formatMigrationError(e, getT().migration_send_failed));
        }
        setPhase('error', 0);
      }
    },
    [
      db,
      deviceId,
      setPhase,
      setDb,
      setHasSession,
      setIsLogged,
      setMasterPassword,
      setRepeatPassword,
      cleanup,
      closeMigration,
      db.settings?.language,
    ]
  );

  const selectDeviceAndMigrate = useCallback(
    async (device: DiscoveredMigrationDevice, pairingSecretOverride?: string) => {
      const secret = pairingSecretOverride || device.pairingSecret;
      if (!secret) {
        setMigrationError(getT().migration_mdns_pairing_required);
        return;
      }
      await runSendToDevice({ ...device, pairingSecret: secret });
    },
    [runSendToDevice, db.settings?.language]
  );

  const connectFromQr = useCallback(
    async (qr: string) => {
      const parsed = parseMigrationQrPayload(qr);
      if (!parsed) {
        setMigrationError(getT().migration_qr_invalid);
        return;
      }
      setMigrationError(null);
      const device: DiscoveredMigrationDevice = {
        name: 'PKEY Device',
        ip: parsed.ip,
        port: parsed.port,
        sessionId: parsed.sessionId,
        pairingSecret: parsed.pairingSecret,
      };
      if (migrationRole !== 'sending') {
        await startSendingDiscovery();
      }
      await runSendToDevice(device);
    },
    [migrationRole, startSendingDiscovery, runSendToDevice, db.settings?.language]
  );

  const connectManual = useCallback(
    async (ip: string, port: number, pairingSecretRaw: string) => {
      const trimmedIp = ip.trim();
      const pairingSecret = normalizePairingCode(pairingSecretRaw);
      if (!trimmedIp || !pairingSecretRaw.trim()) {
        setMigrationError(getT().migration_manual_required);
        return;
      }
      if (!pairingSecret) {
        setMigrationError(getT().migration_manual_pairing_invalid);
        return;
      }
      if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmedIp)) {
        setMigrationError(getT().migration_manual_ip_invalid);
        return;
      }
      const portNum = port || MIGRATION_PORT;
      if (portNum < 1 || portNum > 65535) {
        setMigrationError(getT().migration_manual_port_invalid);
        return;
      }
      setMigrationError(null);
      setPhase('connecting', 5);

      const device: DiscoveredMigrationDevice = {
        name: 'PKEY Device',
        ip: trimmedIp,
        port: portNum,
        sessionId: '',
        pairingSecret,
      };
      if (migrationRole !== 'sending') {
        await startSendingDiscovery();
      }
      await runSendToDevice(device);
    },
    [migrationRole, startSendingDiscovery, runSendToDevice, setPhase, db.settings?.language]
  );

  const finalizeMigration = useCallback(() => {
    const t = getT();
    const live = receiverRef.current?.getFinalizeTarget();
    const target: MigrationFinalizeTarget | null = live
      ? {
          senderIp: live.senderIp,
          senderIpAlternates: live.senderIpAlternates || [],
          senderCallbackPort: live.senderCallbackPort,
          migrationId: live.migrationId,
          pairingSecret: live.pairingSecret,
          sessionId: live.sessionId,
          senderWipeProof: live.senderWipeProof,
        }
      : pendingTargetRef.current;

    if (!target) {
      setMigrationError(t.migration_finalize_no_target);
      return;
    }

    const doFinalize = async () => {
      setPhase('finalizing', 98);
      setMigrationError(null);
      const ok = await requestSenderWipe(
        target.senderIp,
        target.senderCallbackPort,
        target.migrationId,
        target.pairingSecret,
        target.sessionId,
        target.senderWipeProof,
        target.senderIpAlternates
      );
      if (!ok) {
        setMigrationError(t.migration_finalize_failed);
        setPhase('ready_to_finalize', 100);
        return;
      }
      await finishReceiverLocally();
    };

    confirmMigrationAccess(t.migration_auth_finalize, () => {
      void doFinalize();
    });
  }, [setPhase, confirmMigrationAccess, finishReceiverLocally, db.settings?.language]);

  return (
    <MigrationContext.Provider
      value={{
        migrationRole,
        migrationPhase,
        migrationProgress,
        migrationMessage,
        migrationError,
        migrationVisible,
        discoveredDevices,
        receiverQrPayload,
        receiverIp,
        receiverSessionId,
        receiverPairingSecret,
        receiverFingerprint,
        senderFingerprint,
        receiverTlsFingerprint,
        senderTlsFingerprint,
        receiverPort: MIGRATION_PORT,
        nativeMigrationAvailable,
        mdnsAvailable,
        cardCountForMigration: db.cards?.length || 0,
        openMigrationSend,
        openMigrationReceive,
        closeMigration,
        selectDeviceAndMigrate,
        connectFromQr,
        connectManual,
        finalizeMigration,
        abortReceivedMigration,
        cancelMigration,
        incompleteMigrationPending,
      }}
    >
      {children}
    </MigrationContext.Provider>
  );
};
