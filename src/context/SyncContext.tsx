/**
 * @fileoverview Application-level web sync lifecycle (PWA access on port 7392).
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  formatClientIp,
  otherLiveClientsShareIp,
  webClientOsNotifyLabel,
  VAULT_FORK_DECISION_TYPE,
  ACTION_CONFIRM_RESULT_TYPE,
  ACTION_CONFIRM_TIMEOUT_MS,
  SERVER_PUSH_TYPE,
  UNLOCK_CANCEL_TYPE,
  UNLOCK_TIMEOUT_MS,
  encryptControlWire,
  wrapControlInner,
  computeDbVersionHash,
  computeSettingsHash,
  vaultContentChanged,
  type VaultForkAction,
  type PwaActionConfirmKind,
  type ActionConfirmDenyReason,
} from '@pkey/core';
import { useCoreState } from './CoreStateContext';
import { useAuth } from './AuthContext';
import { useUI } from './UIContext';
import { writeDatabaseToDisk } from '../services/storage';
import {
  EMPTY_LAN_NETWORK,
  fetchLanNetwork,
  sameLanSnapshot,
  subscribeLanNetwork,
  type LanNetworkSnapshot,
} from '../services/networkUtils';
import {
  ensureWifiSsidPermission,
  type WifiSsidPermissionStatus,
} from '../utils/wifiSsidPermission';
import {
  SyncWebServer,
  WEB_SYNC_PORT,
  getRunningSyncWebServer,
  forceStopWebSyncServer,
  forceStopWebSyncServerAsync,
  webClientsUiEqual,
} from '../services/syncWebServer';
import { pickCanonicalWebAccessUrl } from '../services/webProtocol';
import { SyncServerCore } from '../services/syncServerCore';
import { WebSyncClient } from '../types';
import { registerWebSyncNotifier, unregisterWebSyncNotifier } from '../services/webSyncNotify';
import {
  startWebForegroundService,
  stopWebForegroundService,
  bindWebForegroundAppState,
  isNativeForegroundServiceAvailable,
  getWebKeepAliveMode,
  setWebForegroundLabels,
} from '../services/webForegroundService';
import { normalizeAppSettings } from '../utils/appSettings';
import { getOrCreateDeviceId } from '../services/deviceId';
import { getOrCreateHostProofSecret } from '../services/hostProofSecret';
import { WebDiscovery, isWebDiscoveryAvailable } from '../services/webDiscovery';
import { getDefaultWebDeviceName } from '../services/webDeviceName';
import { getLocale } from '../constants/localization';
import { notifications, safeOsNotification, safeToast } from '../notifications/notificationRef';
import { ensureOsNotificationPermissions } from '../notifications/osNotificationService';
import {
  clearNotifiedWebClients,
  rememberNotifiedWebClient,
  seedNotifiedWebClients,
} from '../notifications/osNotifiedWebClients';
import {
  applyWebClientAlias,
  parseWebClientAliases,
  SK_WEB_CLIENT_ALIASES,
} from '../utils/webClientAliases';
import {
  registerSyncUndo,
  consumeSyncUndo,
  applySyncUndoToCards,
  SYNC_UNDO_TTL_MS,
} from '../services/syncUndo';
import {
  WEB_LAN_CHANGE_DEBOUNCE_MS,
  clearWebLanAnchor,
  decideWebLanAnchorUpdate,
  loadWebLanAnchor,
  saveWebLanAnchor,
  type WebLanAnchor,
} from '../services/webLanAnchor';
import { setWebAccessLockStopHandler, setAndroidWebAccessKeepAlive } from '../utils/webAccessLock';
import { requestBackgroundLockIfNeeded } from '../utils/autoLogoutGuard';
import { waitForPostBiometricUi } from '../utils/waitForPostBiometricUi';
import { resolvePwaOsIntentAction } from '../notifications/pwaOsIntentAction';

const SK_WEB_ENABLED = '@pkey/sync_web_enabled';
const SK_BLOCKED = '@pkey/sync_blocked';
/** Auto-dismiss for the in-app “browser synced” alert (ms). */
const BROWSER_SYNCED_INAPP_DURATION_MS = 10_000;

const IP_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

interface BlockedPersist {
  sources: string[];
  ips: string[];
  /** sourceId → LAN IP captured at block time (so Unblock clears both). */
  sourceIps: Record<string, string>;
}

function parseSourceIps(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [sid, ip] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof sid !== 'string' || !sid) continue;
    const key = formatClientIp(typeof ip === 'string' ? ip : null);
    if (key) out[sid] = key;
  }
  return out;
}

function parseBlockedPersist(raw: string | null): BlockedPersist {
  if (!raw) return { sources: [], ips: [], sourceIps: {} };
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const sources: string[] = [];
      const ips: string[] = [];
      for (const id of parsed) {
        if (typeof id === 'string' && IP_RE.test(id)) ips.push(id);
        else if (typeof id === 'string') sources.push(id);
      }
      return { sources, ips, sourceIps: {} };
    }
    if (parsed && typeof parsed === 'object') {
      const ips = Array.isArray(parsed.ips)
        ? parsed.ips
            .map((ip: unknown) => formatClientIp(typeof ip === 'string' ? ip : null))
            .filter((ip: string | null): ip is string => !!ip)
        : [];
      return {
        sources: Array.isArray(parsed.sources)
          ? parsed.sources.filter((s: unknown) => typeof s === 'string')
          : [],
        ips: [...new Set(ips)],
        sourceIps: parseSourceIps(parsed.sourceIps),
      };
    }
  } catch {
    /* ignore */
  }
  return { sources: [], ips: [], sourceIps: {} };
}

export type SyncContextData = Readonly<{
  nativeSyncAvailable: boolean;
  webServerEnabled: boolean;
  /** True while starting/stopping the LAN web server (UI should disable the toggle). */
  webServerBusy: boolean;
  webForegroundActive: boolean;
  nativeForegroundAvailable: boolean;
  /** Platform keep-alive mode for web-access status copy. */
  webKeepAliveMode: 'android-native' | 'android-fallback' | 'ios-native' | 'none';
  enableWebServer: () => Promise<void>;
  disableWebServer: () => void;
  webQrUrl: string | null;
  webIpUrl: string | null;
  webMdnsUrl: string | null;
  webPort: number;
  localIp: string | null;
  mdnsWebAvailable: boolean;
  connectedWebClients: WebSyncClient[];
  blockDevice: (sourceId: string) => void;
  unblockDevice: (sourceId: string) => void;
  blockedSources: string[];
  /** LAN IPs blocked together with a browser; drops HTTP GET / as well as WS. */
  blockedIps: string[];
  unblockIp: (ip: string) => void;
  blockWebClient: (socketId: string) => void;
  /** Block by durable identity (works after the socket is gone). */
  blockClientIdentity: (identity: { sourceId?: string | null; ip?: string | null }) => void;
  /** Local nicknames keyed by `sourceId` (this phone only). */
  webClientAliases: Record<string, string>;
  setWebClientAlias: (sourceId: string, alias: string) => void;
  webReactivatePending: boolean;
  dismissWebReactivate: () => void;
  reactivateWebServer: () => Promise<void>;
  /** Live LAN / cellular snapshot for web-access status UI. */
  lanNetwork: LanNetworkSnapshot;
  /** Prompts for location-when-in-use so NetInfo can expose the Wi-Fi SSID. */
  revealLanSsid: () => Promise<WifiSsidPermissionStatus>;
  /** Browser reported a different vault salt; null when no chooser is open. */
  vaultForkPrompt: { sourceId: string; pwaCardCount: number; encryptedOnly: boolean } | null;
  resolveVaultFork: (action: VaultForkAction) => void;
  /** PWA asked this phone to confirm a sensitive action; null when idle. */
  actionConfirmPrompt: {
    sourceId: string;
    requestId: string;
    action: PwaActionConfirmKind;
    cardId?: string;
  } | null;
  resolveActionConfirm: (ok: boolean, reason?: ActionConfirmDenyReason) => void;
  beginActionConfirmAuth: () => void;
  handleActionConfirmOsIntent: (kind: 'open' | 'deny', requestId: string | null) => void;
  /** Browser asked this phone to unlock the PWA; null when idle. */
  unlockPrompt: { sourceId: string; requestId: string; sas: string } | null;
  resolveUnlock: (ok: boolean) => void;
  beginUnlockAuth: () => void;
  /** True while the phone-side SAS unlock prompt is running biometrics/password. */
  unlockAuthBusy: boolean;
  handleUnlockOsIntent: (
    kind: 'open' | 'deny',
    requestId: string | null,
    options?: { afterVaultUnlock?: boolean }
  ) => void;
}>;

const SyncContext = createContext<SyncContextData>({} as SyncContextData);

function pwaActionVerbFromLocale(
  t: ReturnType<typeof getLocale>,
  action: PwaActionConfirmKind
): string {
  switch (action) {
    case 'edit':
      return t.web_action_edit;
    case 'delete':
      return t.web_action_delete;
    case 'reveal':
      return t.web_action_reveal;
    case 'copy':
      return t.web_action_copy;
    case 'copy_otp':
      return t.web_action_copy_otp;
    case 'reveal_otp':
      return t.web_action_reveal_otp;
    case 'copy_username':
      return t.web_action_copy_username;
    default:
      return t.web_action_copy;
  }
}

/** Consumes web-access server lifecycle and connected-client state. */
export const useSync = () => useContext(SyncContext);

/** Manages the local PWA sync server, mDNS discovery, and client blocklist. */
export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { db, setDb, dbRef, masterPassword } = useCoreState();
  const { currentTab } = useUI();
  const { performBiometricOrPasswordCheck } = useAuth();

  const [webServerEnabled, setWebServerEnabled] = useState(false);
  const [webServerBusy, setWebServerBusy] = useState(false);
  const webServerBusyRef = useRef(false);
  const [webForegroundActive, setWebForegroundActive] = useState(false);
  const [webQrUrl, setWebQrUrl] = useState<string | null>(null);
  const [webIpUrl, setWebIpUrl] = useState<string | null>(null);
  const [webMdnsUrl, setWebMdnsUrl] = useState<string | null>(null);
  const [localIp, setLocalIp] = useState<string | null>(null);
  const [lanNetwork, setLanNetwork] = useState<LanNetworkSnapshot>(EMPTY_LAN_NETWORK);
  const [connectedWebClients, setConnectedWebClients] = useState<WebSyncClient[]>([]);
  const [blockedSources, setBlockedSources] = useState<string[]>([]);
  const [blockedIps, setBlockedIps] = useState<string[]>([]);
  const [webClientAliases, setWebClientAliases] = useState<Record<string, string>>({});
  const [webReactivatePending, setWebReactivatePending] = useState(false);
  const [vaultForkPrompt, setVaultForkPrompt] = useState<{
    sourceId: string;
    pwaCardCount: number;
    encryptedOnly: boolean;
  } | null>(null);
  const [actionConfirmPrompt, setActionConfirmPrompt] = useState<{
    sourceId: string;
    requestId: string;
    action: PwaActionConfirmKind;
    cardId?: string;
  } | null>(null);
  const [unlockPrompt, setUnlockPrompt] = useState<{
    sourceId: string;
    requestId: string;
    sas: string;
  } | null>(null);
  const [unlockAuthBusy, setUnlockAuthBusy] = useState(false);

  const webServerRef = useRef<SyncWebServer | null>(null);
  const coreRef = useRef<SyncServerCore | null>(null);
  const webDiscoveryRef = useRef<WebDiscovery | null>(null);
  const deviceIdRef = useRef('');
  /** Pairing secret for pre-auth host proofs (never the vault verifier). */
  const hostProofSecretRef = useRef('');
  /** Mirrors `localIp` so `/pkey/meta` can read it synchronously. */
  const localIpRef = useRef('');
  const blockedSourcesRef = useRef<string[]>([]);
  const blockedIpsRef = useRef<string[]>([]);
  const blockedSourceIpsRef = useRef<Record<string, string>>({});
  const blockedReadyRef = useRef<Promise<void>>(Promise.resolve());
  const lanAnchorRef = useRef<WebLanAnchor | null>(null);
  const lastLanNotifyAtRef = useRef(0);
  const lanDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webServerEnabledRef = useRef(false);
  /** Bumped on every stop so an in-flight start cannot revive the server after lock. */
  const webGenerationRef = useRef(0);
  const connectedWebClientsRef = useRef<WebSyncClient[]>([]);
  const masterPasswordRef = useRef(masterPassword);
  masterPasswordRef.current = masterPassword;
  const vaultForkHandlerRef = useRef<
    (info: { sourceId: string; pwaCardCount: number; encryptedOnly: boolean }) => void
  >(() => {});
  const vaultForkCancelRef = useRef<(sourceId: string) => void>(() => {});
  vaultForkHandlerRef.current = (info) => setVaultForkPrompt(info);
  vaultForkCancelRef.current = (sourceId) => {
    setVaultForkPrompt((cur) => (cur?.sourceId === sourceId ? null : cur));
  };
  const actionConfirmHandlerRef = useRef<
    (info: {
      sourceId: string;
      requestId: string;
      action: PwaActionConfirmKind;
      cardId?: string;
    }) => void
  >(() => {});
  const actionConfirmCancelRef = useRef<(info: { sourceId: string; requestId: string }) => void>(
    () => {}
  );
  const actionConfirmPromptRef = useRef(actionConfirmPrompt);
  actionConfirmPromptRef.current = actionConfirmPrompt;
  actionConfirmHandlerRef.current = (info) => {
    setActionConfirmPrompt(info);
    if (AppState.currentState === 'active') return;
    const t = getLocale(dbRef.current.settings?.language);
    const actionLabel = pwaActionVerbFromLocale(t, info.action);
    const client = connectedWebClientsRef.current.find((item) => item.sourceId === info.sourceId);
    const label = webClientOsNotifyLabel({
      alias: webClientAliases[info.sourceId],
      userAgent: client?.userAgent,
      fallback: t.web_client_unknown,
    });
    void safeOsNotification({
      id: 'pwa-action-confirm',
      title: t.web_notif_pwa_confirm_title,
      body: t.web_notif_pwa_confirm_body
        .replace('{client}', label)
        .replace('{action}', actionLabel),
      channel: 'pkey-actions',
      data: {
        type: 'pwa-action-confirm',
        sourceId: info.sourceId,
        requestId: info.requestId,
      },
    });
  };
  actionConfirmCancelRef.current = (info) => {
    setActionConfirmPrompt((cur) =>
      cur && cur.sourceId === info.sourceId && cur.requestId === info.requestId ? null : cur
    );
  };
  const unlockHandlerRef = useRef<
    (info: { sourceId: string; requestId: string; sas: string }) => void
  >(() => {});
  const unlockCancelRef = useRef<(info: { sourceId: string; requestId: string }) => void>(() => {});
  const unlockPromptRef = useRef(unlockPrompt);
  unlockPromptRef.current = unlockPrompt;
  const unlockAuthInFlightRef = useRef(false);
  unlockHandlerRef.current = (info) => {
    setUnlockPrompt(info);
    if (AppState.currentState === 'active') return;
    const t = getLocale(dbRef.current.settings?.language);
    const client = connectedWebClientsRef.current.find((item) => item.sourceId === info.sourceId);
    const label = webClientOsNotifyLabel({
      alias: webClientAliases[info.sourceId],
      userAgent: client?.userAgent,
      fallback: t.web_client_unknown,
    });
    void safeOsNotification({
      id: 'pwa-unlock',
      title: t.web_notif_pwa_unlock_title,
      body: t.web_notif_pwa_unlock_body.replace('{client}', label),
      channel: 'pkey-actions',
      data: {
        type: 'pwa-unlock',
        sourceId: info.sourceId,
        requestId: info.requestId,
      },
    });
  };
  unlockCancelRef.current = (info) => {
    setUnlockPrompt((cur) =>
      cur && cur.sourceId === info.sourceId && cur.requestId === info.requestId ? null : cur
    );
  };

  webServerEnabledRef.current = webServerEnabled;
  connectedWebClientsRef.current = connectedWebClients;

  const nativeSyncAvailable = SyncWebServer.isAvailable();
  const mdnsWebAvailable = isWebDiscoveryAvailable();

  useEffect(() => {
    let resolveReady: () => void = () => {};
    blockedReadyRef.current = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    (async () => {
      try {
        const [blockedStr, aliasesStr, deviceId, lanAnchor] = await Promise.all([
          AsyncStorage.getItem(SK_BLOCKED),
          AsyncStorage.getItem(SK_WEB_CLIENT_ALIASES),
          getOrCreateDeviceId(),
          loadWebLanAnchor(),
        ]);
        lanAnchorRef.current = lanAnchor;
        if (blockedStr) {
          const { sources, ips, sourceIps } = parseBlockedPersist(blockedStr);
          blockedSourcesRef.current = sources;
          blockedIpsRef.current = ips;
          blockedSourceIpsRef.current = sourceIps;
          setBlockedSources(sources);
          setBlockedIps(ips);
        }
        setWebClientAliases(parseWebClientAliases(aliasesStr));
        deviceIdRef.current = deviceId;
      } finally {
        resolveReady();
      }
    })();
  }, []);

  useEffect(() => {
    const salt = db.salt;
    if (!salt) return;
    void getOrCreateHostProofSecret(salt).then((secret) => {
      hostProofSecretRef.current = secret;
    });
  }, [db.salt]);

  const buildCore = useCallback((): SyncServerCore => {
    return new SyncServerCore({
      getDb: () => dbRef.current,
      setDb: async (newDb, sourceId) => {
        const prev = dbRef.current;
        const normalized = {
          ...newDb,
          settings: normalizeAppSettings(newDb.settings, newDb.cards || []),
        };
        setDb(normalized);
        if (vaultContentChanged(prev, normalized)) {
          webServerRef.current?.pushToAll(
            {
              type: SERVER_PUSH_TYPE,
              versionHash: computeDbVersionHash(normalized),
              settingsHash: computeSettingsHash(normalized.settings),
            },
            sourceId
          );
        }
        try {
          await writeDatabaseToDisk(normalized, masterPasswordRef.current);
        } catch {
          /* best-effort */
        }
      },
      onFieldOverwrites: (overwrites, _sourceId, snapshot) => {
        if (!overwrites.length) return;
        const lang = dbRef.current?.settings?.language;
        const title =
          lang === 'ESP' ? 'Sync fusionó ediciones conflictivas' : 'Sync merged conflicting edits';
        const totalFields = overwrites.reduce((acc, o) => acc + o.fields.length, 0);
        const body =
          lang === 'ESP'
            ? `${overwrites.length} llave(s) tenían campos distintos en ambos lados; se conservó lo más reciente y se rellenaron vacíos.`
            : `${overwrites.length} key(s) had differing fields on both sides; newest values were kept and empty fields filled.`;

        // Register the pre-merge snapshot so the user can undo within 5min
        // (audit finding M2). The token round-trips through the alert action
        // so the closure captures the exact snapshot instance.
        const token = registerSyncUndo(snapshot, totalFields);

        notifications.alert({
          title,
          message: body,
          variant: 'warning',
          duration: SYNC_UNDO_TTL_MS, // dismiss the alert when the undo window closes
          actions: [
            {
              text: lang === 'ESP' ? 'Deshacer' : 'Undo',
              style: 'default',
              onPress: () => {
                const restored = consumeSyncUndo(token);
                if (!restored) {
                  safeToast({
                    title:
                      lang === 'ESP' ? 'Ya no se puede deshacer (expirado)' : 'Undo window expired',
                    variant: 'info',
                  });
                  return;
                }
                const live = dbRef.current;
                if (!live) return;
                const nextCards = applySyncUndoToCards(live.cards || [], restored.cardsById);
                const nextDb = {
                  ...live,
                  cards: nextCards,
                  last_update: new Date().toISOString(),
                };
                setDb(nextDb);
                webServerRef.current?.pushToAll({
                  type: SERVER_PUSH_TYPE,
                  versionHash: computeDbVersionHash(nextDb),
                  settingsHash: computeSettingsHash(nextDb.settings),
                });
                void writeDatabaseToDisk(nextDb, masterPasswordRef.current).catch(() => {
                  /* best-effort */
                });
                safeToast({
                  title: lang === 'ESP' ? 'Cambios revertidos' : 'Changes reverted',
                  variant: 'success',
                });
              },
            },
            {
              text: lang === 'ESP' ? 'Entendido' : 'OK',
              style: 'cancel',
            },
          ],
        });
      },
      onEvent: () => {
        /* web clients tracked via SyncWebServer */
      },
      onVaultFork: (info) => {
        vaultForkHandlerRef.current(info);
      },
      onVaultForkCancelled: (sourceId) => vaultForkCancelRef.current(sourceId),
      onActionConfirm: (info) => actionConfirmHandlerRef.current(info),
      onActionConfirmCancelled: (info) => actionConfirmCancelRef.current(info),
      onUnlockRequest: (info) => unlockHandlerRef.current(info),
      onUnlockCancelled: (info) => unlockCancelRef.current(info),
      getHostProofSecret: () => hostProofSecretRef.current,
    });
  }, [setDb]);

  const ensureSyncCore = useCallback((): SyncServerCore => {
    const applyBlocklist = (core: SyncServerCore) => {
      blockedSourcesRef.current.forEach((id) => core.blockSource(id));
      blockedIpsRef.current.forEach((ip) => core.blockIp(ip));
    };
    if (!coreRef.current) {
      coreRef.current = buildCore();
    }
    applyBlocklist(coreRef.current);
    return coreRef.current;
  }, [buildCore]);

  const applyLanSnapshot = useCallback((snap: LanNetworkSnapshot): void => {
    setLanNetwork((prev) => (sameLanSnapshot(prev, snap) ? prev : snap));
    const lanIp = snap.isLikelyLan ? snap.ip : null;
    localIpRef.current = lanIp ?? '';
    setLocalIp((prev) => (prev === lanIp ? prev : lanIp));
    const ipUrl = lanIp ? `http://${lanIp}:${WEB_SYNC_PORT}` : null;
    setWebIpUrl((prev) => (prev === ipUrl ? prev : ipUrl));
    const mdnsPublished = webDiscoveryRef.current?.getPublishedUrl() ?? null;
    const mdnsUrl = mdnsPublished ? mdnsPublished.replace(/^https?:/, 'http:') : null;
    setWebMdnsUrl((prev) => (prev === mdnsUrl ? prev : mdnsUrl));
    const qrUrl = pickCanonicalWebAccessUrl(mdnsUrl, ipUrl);
    setWebQrUrl((prev) => (prev === qrUrl ? prev : qrUrl));
  }, []);

  const applyLanAnchorDecision = useCallback(
    (snap: LanNetworkSnapshot): void => {
      if (!webServerEnabledRef.current) return;
      const live = webServerRef.current?.isLive() === true;
      const decision = decideWebLanAnchorUpdate({
        prev: lanAnchorRef.current,
        snap,
        serverOn: live,
        authenticatedCount: connectedWebClientsRef.current.filter((c) => c.authenticated).length,
        lastNotifyAt: lastLanNotifyAtRef.current,
      });
      if (decision.action === 'ignore') return;
      lanAnchorRef.current = decision.anchor;
      void saveWebLanAnchor(decision.anchor);
      if (decision.action !== 'notify') return;
      lastLanNotifyAtRef.current = Date.now();
      const t = getLocale(dbRef.current.settings?.language);
      if (AppState.currentState === 'active') {
        notifications.alert({
          title: t.web_notif_lan_changed_title,
          message: t.web_notif_lan_changed_inapp,
          variant: 'warning',
        });
        return;
      }
      void safeOsNotification({
        id: 'pkey-web-lan-changed',
        title: t.web_notif_lan_changed_title,
        body: t.web_notif_lan_changed_body,
        channel: 'pkey-actions',
        data: { type: 'web-lan-changed' },
      });
    },
    [dbRef]
  );

  const refreshWebAccessUrls = useCallback(async (): Promise<LanNetworkSnapshot> => {
    const snap = await fetchLanNetwork();
    applyLanSnapshot(snap);
    return snap;
  }, [applyLanSnapshot]);

  const revealLanSsid = useCallback(async (): Promise<WifiSsidPermissionStatus> => {
    const status = await ensureWifiSsidPermission();
    if (status !== 'granted') return status;
    const delaysMs = [0, 400, 800];
    for (const delayMs of delaysMs) {
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      const snap = await fetchLanNetwork();
      applyLanSnapshot(snap);
      if (snap.ssid) break;
    }
    return status;
  }, [applyLanSnapshot]);

  const startWebDiscovery = useCallback(async (): Promise<void> => {
    if (!isWebDiscoveryAvailable() || !deviceIdRef.current) return;

    const baseName = getDefaultWebDeviceName();

    if (!webDiscoveryRef.current) {
      webDiscoveryRef.current = new WebDiscovery();
    }

    const url = await webDiscoveryRef.current.publish(WEB_SYNC_PORT, deviceIdRef.current, baseName);
    if (!url) {
      console.warn('[WebDiscovery] mDNS publish failed — IP fallback only');
    }
  }, []);

  /** Reattach UI state to the running server (survives tab switches / app resume). */
  const syncUiFromServer = useCallback(async (): Promise<boolean> => {
    const running =
      (webServerRef.current?.isLive?.() ? webServerRef.current : null) ?? getRunningSyncWebServer();

    if (!running?.running) {
      return false;
    }

    webServerRef.current = running;
    running.setOnClientsChanged(setConnectedWebClients);
    registerWebSyncNotifier(() => {
      const snap = dbRef.current;
      webServerRef.current?.pushToAll({
        type: SERVER_PUSH_TYPE,
        versionHash: computeDbVersionHash(snap),
        settingsHash: computeSettingsHash(snap.settings),
      });
    });
    const snapshot = running.getClientSnapshot();
    setConnectedWebClients((prev) => (webClientsUiEqual(prev, snapshot) ? prev : snapshot));
    // Seed so resume/reattach does not re-alert for already-synced browsers.
    seedNotifiedWebClients(
      snapshot.filter((c) => c.authenticated).map((c) => c.sourceId || c.socketId)
    );

    if (!webDiscoveryRef.current?.isPublished()) {
      await startWebDiscovery();
    }
    const liveSnap = await refreshWebAccessUrls();
    if (!webServerEnabledRef.current) {
      setWebServerEnabled(true);
    }
    webServerEnabledRef.current = true;
    applyLanAnchorDecision(liveSnap);
    return true;
  }, [startWebDiscovery, refreshWebAccessUrls, applyLanAnchorDecision]);

  /**
   * Tears down the LAN server + keep-alive. Vault lock uses `persistOff: false`
   * so autostart / the reactivate prompt can restore after unlock.
   */
  const stopWebServerRuntime = useCallback((persistOff: boolean) => {
    // Always allow stop (logout / migration), even if a start is in flight.
    webGenerationRef.current += 1;
    webServerBusyRef.current = true;
    setWebServerBusy(true);
    try {
      unregisterWebSyncNotifier();
      stopWebForegroundService().catch(() => {});
      setWebForegroundActive(false);
      webDiscoveryRef.current?.unpublish();
      webDiscoveryRef.current = null;
      forceStopWebSyncServer();
      webServerRef.current = null;
      coreRef.current = null;
      setWebServerEnabled(false);
      webServerEnabledRef.current = false;
      setWebQrUrl(null);
      setWebIpUrl(null);
      setWebMdnsUrl(null);
      setLocalIp(null);
      setConnectedWebClients([]);
      setVaultForkPrompt(null);
      setActionConfirmPrompt(null);
      setUnlockPrompt(null);
      clearNotifiedWebClients();
      lanAnchorRef.current = null;
      lastLanNotifyAtRef.current = 0;
      void clearWebLanAnchor();
      if (persistOff) {
        AsyncStorage.setItem(SK_WEB_ENABLED, 'false');
      }
    } finally {
      webServerBusyRef.current = false;
      setWebServerBusy(false);
    }
  }, []);

  const startWebServerCore = useCallback(async (): Promise<boolean> => {
    if (!nativeSyncAvailable) return false;
    if (!dbRef.current.passwordHash) return false;
    const gen = webGenerationRef.current;
    const isStale = (): boolean => gen !== webGenerationRef.current || !dbRef.current.passwordHash;

    await blockedReadyRef.current;
    if (isStale()) return false;

    if (await syncUiFromServer()) {
      if (isStale()) {
        stopWebServerRuntime(false);
        return false;
      }
      return true;
    }

    await forceStopWebSyncServerAsync();
    if (isStale()) return false;

    hostProofSecretRef.current = await getOrCreateHostProofSecret(dbRef.current.salt || '');
    if (isStale()) return false;
    const core = ensureSyncCore();

    const snap = await fetchLanNetwork();
    if (isStale()) return false;
    applyLanSnapshot(snap);

    const attemptBind = async (): Promise<SyncWebServer | null> => {
      if (isStale()) return null;
      const webServer = new SyncWebServer();
      webServer.setOnClientsChanged(setConnectedWebClients);
      try {
        await webServer.start(core, WEB_SYNC_PORT, {
          deviceId: deviceIdRef.current,
          // Getter: mDNS often publishes after the bind.
          mdnsHost: () => webDiscoveryRef.current?.getPublishedHost() ?? '',
          ipProvider: () => localIpRef.current,
        });
        if (isStale()) {
          try {
            webServer.hardClose();
          } catch {
            /* ignore */
          }
          return null;
        }
        return webServer;
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        const errCode = (e as { code?: string })?.code || null;
        console.warn('[SyncWebServer] bind failed:', errMsg, errCode || '');
        try {
          webServer.hardClose();
        } catch {
          /* ignore */
        }
        return null;
      }
    };

    let webServer = await attemptBind();
    if (!webServer) {
      for (let attempt = 1; attempt <= 3 && !webServer; attempt += 1) {
        if (isStale()) return false;
        // EADDRINUSE after reload: reclaim process-level native listen sockets, then retry.
        await forceStopWebSyncServerAsync({ reclaimOrphanNative: true });
        webServer = await attemptBind();
      }
    }

    if (!webServer) {
      if (isStale()) return false;
      const reattached = await syncUiFromServer();
      if (reattached) {
        if (isStale()) {
          stopWebServerRuntime(false);
          return false;
        }
        return true;
      }
      console.warn('[SyncWebServer] Failed to start after auto-recovery retries.');
      return false;
    }

    if (isStale()) {
      try {
        webServer.hardClose();
      } catch {
        /* ignore */
      }
      return false;
    }

    webServerRef.current = webServer;

    registerWebSyncNotifier(() => {
      const snap = dbRef.current;
      webServerRef.current?.pushToAll({
        type: SERVER_PUSH_TYPE,
        versionHash: computeDbVersionHash(snap),
        settingsHash: computeSettingsHash(snap.settings),
      });
    });

    try {
      setWebForegroundLabels(db.settings?.language);
      await startWebForegroundService();
      if (isStale()) {
        stopWebServerRuntime(false);
        return false;
      }
      setWebForegroundActive(true);
    } catch (e) {
      console.warn('[WebForegroundService] Failed to start:', e);
    }

    const t = getLocale(db.settings?.language);
    await ensureOsNotificationPermissions(t.web_notif_block_action);
    if (isStale()) {
      stopWebServerRuntime(false);
      return false;
    }

    await startWebDiscovery();
    if (isStale()) {
      stopWebServerRuntime(false);
      return false;
    }
    const liveSnap = await refreshWebAccessUrls();
    if (isStale()) {
      stopWebServerRuntime(false);
      return false;
    }
    seedNotifiedWebClients(
      webServer
        .getClientSnapshot()
        .filter((c) => c.authenticated)
        .map((c) => c.sourceId || c.socketId)
    );
    setWebServerEnabled(true);
    webServerEnabledRef.current = true;
    webServer.republishClients();
    applyLanAnchorDecision(liveSnap);
    await AsyncStorage.setItem(SK_WEB_ENABLED, 'true');
    if (isStale()) {
      stopWebServerRuntime(false);
      return false;
    }
    return true;
  }, [
    nativeSyncAvailable,
    ensureSyncCore,
    syncUiFromServer,
    stopWebServerRuntime,
    db.settings?.language,
    startWebDiscovery,
    refreshWebAccessUrls,
    applyLanSnapshot,
    applyLanAnchorDecision,
  ]);

  useEffect(() => {
    setWebForegroundLabels(db.settings?.language);
    if (!webServerEnabled) return;
    startWebForegroundService().catch(() => {});
    const t = getLocale(db.settings?.language);
    void ensureOsNotificationPermissions(t.web_notif_block_action);
  }, [db.settings?.language, webServerEnabled]);

  const enableWebServer = useCallback(async () => {
    if (webServerBusyRef.current) return;
    if (webServerEnabled) return;
    webServerBusyRef.current = true;
    setWebServerBusy(true);
    setWebServerEnabled(true);
    webServerEnabledRef.current = true;
    const gen = webGenerationRef.current;
    try {
      const ok = await startWebServerCore();
      if (!ok) {
        setWebServerEnabled(false);
        webServerEnabledRef.current = false;
        try {
          forceStopWebSyncServer();
        } catch {
          /* ignore */
        }
        webServerRef.current = null;
        coreRef.current = null;
        setWebQrUrl(null);
        setWebIpUrl(null);
        setWebMdnsUrl(null);
        setLocalIp(null);
        setConnectedWebClients([]);
        if (gen !== webGenerationRef.current || !dbRef.current.passwordHash) return;
        const t = getLocale(db.settings?.language);
        notifications.alert({
          title: t.alert_error_title,
          message: t.web_access_start_failed,
          variant: 'error',
        });
      }
    } finally {
      webServerBusyRef.current = false;
      setWebServerBusy(false);
    }
  }, [webServerEnabled, startWebServerCore, db.settings?.language]);

  const disableWebServer = useCallback(() => {
    stopWebServerRuntime(true);
  }, [stopWebServerRuntime]);

  useEffect(() => {
    setWebAccessLockStopHandler(() => {
      stopWebServerRuntime(false);
    });
    return () => setWebAccessLockStopHandler(null);
  }, [stopWebServerRuntime]);

  const androidKeepAlivePrevRef = useRef(false);
  useEffect(() => {
    const keep = Platform.OS === 'android' && webServerEnabled;
    const was = androidKeepAlivePrevRef.current;
    setAndroidWebAccessKeepAlive(keep);
    androidKeepAlivePrevRef.current = keep;
    if (was && !keep) {
      requestBackgroundLockIfNeeded();
    }
  }, [webServerEnabled]);

  useEffect(() => {
    return () => setAndroidWebAccessKeepAlive(false);
  }, []);

  const prevLogged = useRef(false);
  const hadPasswordHashRef = useRef(false);

  useEffect(() => {
    if (db.passwordHash) {
      hadPasswordHashRef.current = true;
      if (!prevLogged.current) {
        prevLogged.current = true;
        (async () => {
          const webEnabledStr = await AsyncStorage.getItem(SK_WEB_ENABLED);
          if (webEnabledStr !== 'true') return;
          const autoStart =
            dbRef.current.settings?.strictOffline !== true &&
            dbRef.current.settings?.webAccessAutoStart === true;
          if (autoStart) {
            await startWebServerCore();
          } else {
            setWebReactivatePending(true);
          }
        })();
      }
      return;
    }
    // Only tear down web access on real logout — not the initial empty db before login.
    // Do not persist "off": lock must stop sockets but keep the user's last choice.
    if (hadPasswordHashRef.current) {
      hadPasswordHashRef.current = false;
      prevLogged.current = false;
      stopWebServerRuntime(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.passwordHash]);

  blockedSourcesRef.current = blockedSources;
  blockedIpsRef.current = blockedIps;

  const persistBlocked = useCallback((sources: string[], ips: string[]) => {
    AsyncStorage.setItem(
      SK_BLOCKED,
      JSON.stringify({ sources, ips, sourceIps: blockedSourceIpsRef.current })
    );
  }, []);

  const setWebClientAlias = useCallback((sourceId: string, alias: string) => {
    setWebClientAliases((prev) => {
      const next = applyWebClientAlias(prev, sourceId, alias);
      if (next === prev) return prev;
      AsyncStorage.setItem(SK_WEB_CLIENT_ALIASES, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const blockDevice = useCallback(
    (sourceId: string) => {
      coreRef.current?.blockSource(sourceId);
      webServerRef.current?.disconnectBySourceId(sourceId);
      getRunningSyncWebServer()?.disconnectBySourceId(sourceId);
      setBlockedSources((prev) => {
        const next = [...new Set([...prev, sourceId])];
        blockedSourcesRef.current = next;
        persistBlocked(next, blockedIpsRef.current);
        return next;
      });
    },
    [persistBlocked]
  );

  const dropSourceIpPair = useCallback((sourceId: string): string | undefined => {
    const paired = blockedSourceIpsRef.current[sourceId];
    if (!paired) return undefined;
    const nextPairs = { ...blockedSourceIpsRef.current };
    delete nextPairs[sourceId];
    blockedSourceIpsRef.current = nextPairs;
    return paired;
  }, []);

  const unblockIp = useCallback(
    (ip: string) => {
      const key = formatClientIp(ip);
      if (!key) return;
      coreRef.current?.unblockIp(key);
      const nextPairs: Record<string, string> = {};
      for (const [sid, mapped] of Object.entries(blockedSourceIpsRef.current)) {
        if (mapped !== key) nextPairs[sid] = mapped;
      }
      blockedSourceIpsRef.current = nextPairs;
      setBlockedIps((prev) => {
        const next = prev.filter((id) => formatClientIp(id) !== key);
        blockedIpsRef.current = next;
        persistBlocked(blockedSourcesRef.current, next);
        return next;
      });
    },
    [persistBlocked]
  );

  const unblockDevice = useCallback(
    (sourceId: string) => {
      coreRef.current?.unblockSource(sourceId);
      const pairedIp = dropSourceIpPair(sourceId);
      if (pairedIp) coreRef.current?.unblockIp(pairedIp);
      setBlockedSources((prev) => {
        const next = prev.filter((id) => id !== sourceId);
        blockedSourcesRef.current = next;
        return next;
      });
      setBlockedIps((prev) => {
        const next = pairedIp ? prev.filter((id) => formatClientIp(id) !== pairedIp) : prev;
        blockedIpsRef.current = next;
        persistBlocked(blockedSourcesRef.current, next);
        return next;
      });
    },
    [dropSourceIpPair, persistBlocked]
  );

  const blockIp = useCallback(
    (ip: string) => {
      const key = formatClientIp(ip);
      if (!key) return;
      coreRef.current?.blockIp(key);
      webServerRef.current?.disconnectByIp(key);
      getRunningSyncWebServer()?.disconnectByIp(key);
      setBlockedIps((prev) => {
        const next = [...new Set([...prev, key])];
        blockedIpsRef.current = next;
        persistBlocked(blockedSourcesRef.current, next);
        return next;
      });
    },
    [persistBlocked]
  );

  const blockClientIdentity = useCallback(
    (identity: { sourceId?: string | null; ip?: string | null }) => {
      const sourceId = identity.sourceId?.trim();
      if (sourceId) blockDevice(sourceId);
      const ip = formatClientIp(identity.ip) ?? identity.ip?.trim() ?? '';
      if (ip && !otherLiveClientsShareIp(ip, sourceId, connectedWebClientsRef.current)) {
        if (sourceId) {
          blockedSourceIpsRef.current = { ...blockedSourceIpsRef.current, [sourceId]: ip };
        }
        blockIp(ip);
      }
    },
    [blockDevice, blockIp]
  );

  const blockWebClient = useCallback(
    (socketId: string) => {
      const client = connectedWebClients.find((c) => c.socketId === socketId);
      blockClientIdentity({ sourceId: client?.sourceId, ip: client?.ip });
    },
    [connectedWebClients, blockClientIdentity]
  );

  const reactivateWebServer = useCallback(async () => {
    setWebReactivatePending(false);
    await enableWebServer();
  }, [enableWebServer]);

  const dismissWebReactivate = useCallback(() => {
    setWebReactivatePending(false);
  }, []);

  /** In-app alert (foreground, auto-dismiss) or OS alert (background) when a browser newly authenticates. */
  useEffect(() => {
    if (!webServerEnabled) return;

    const authClients = connectedWebClients.filter((c) => c.authenticated);
    const t = getLocale(db.settings?.language);

    for (const client of authClients) {
      const id = client.sourceId || client.socketId;
      if (!rememberNotifiedWebClient(id)) continue;

      const label = webClientOsNotifyLabel({
        alias: client.sourceId ? webClientAliases[client.sourceId] : undefined,
        userAgent: client.userAgent,
        fallback: t.web_client_unknown,
      });
      const title = t.web_notif_browser_title;
      const body = t.web_notif_browser_body.replace('{client}', label);
      const identity = { sourceId: client.sourceId, ip: client.ip ?? null };

      if (AppState.currentState === 'active') {
        notifications.alert({
          title,
          message: body,
          variant: 'info',
          duration: BROWSER_SYNCED_INAPP_DURATION_MS,
          actions: [
            { text: t.cancel_button, style: 'cancel' },
            {
              text: t.web_notif_block_action,
              style: 'destructive',
              onPress: () => {
                void performBiometricOrPasswordCheck(() => {
                  blockClientIdentity(identity);
                }, t.require_auth_block_web_client);
              },
            },
          ],
        });
        continue;
      }

      safeOsNotification({
        id: `web-browser-${id}-${Date.now()}`,
        title,
        body,
        channel: 'pkey-actions',
        data: {
          type: 'web-browser-synced',
          sourceId: client.sourceId,
          socketId: client.socketId,
          ip: client.ip ?? null,
        },
      });
    }
  }, [
    blockClientIdentity,
    connectedWebClients,
    db.settings?.language,
    performBiometricOrPasswordCheck,
    webClientAliases,
    webServerEnabled,
  ]);

  useEffect(() => {
    const unsubscribe = subscribeLanNetwork((snap) => {
      applyLanSnapshot(snap);
      if (lanDebounceTimerRef.current) clearTimeout(lanDebounceTimerRef.current);
      lanDebounceTimerRef.current = setTimeout(() => {
        lanDebounceTimerRef.current = null;
        applyLanAnchorDecision(snap);
      }, WEB_LAN_CHANGE_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (lanDebounceTimerRef.current) {
        clearTimeout(lanDebounceTimerRef.current);
        lanDebounceTimerRef.current = null;
      }
    };
  }, [applyLanSnapshot, applyLanAnchorDecision]);

  useEffect(() => {
    if (!webServerEnabled) return () => {};
    return bindWebForegroundAppState(webServerEnabled);
  }, [webServerEnabled]);

  /**
   * Refresh QR + client list when returning to the app.
   * On iOS the LAN server often dies after the background grace period —
   * restart it automatically if the user still has web access enabled
   * and the vault is unlocked.
   */
  useEffect(() => {
    if (!webServerEnabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      (async () => {
        if (!webServerEnabledRef.current || !dbRef.current.passwordHash) return;
        const live = await syncUiFromServer();
        if (!live && webServerEnabledRef.current && dbRef.current.passwordHash) {
          await startWebServerCore();
        }
      })().catch(() => {});
    });
    return () => sub.remove();
  }, [webServerEnabled, syncUiFromServer, startWebServerCore]);

  useEffect(() => {
    if (currentTab === 'security' && webServerEnabled) {
      syncUiFromServer();
    }
  }, [currentTab, webServerEnabled, syncUiFromServer]);

  const sendControlToSource = useCallback(
    (sourceId: string, type: string, fields: Record<string, unknown>): boolean => {
      const token = webServerRef.current?.getTokenForSource(sourceId);
      const hash = dbRef.current?.passwordHash;
      if (!token || !hash) return false;
      return (
        webServerRef.current?.sendToSource(
          sourceId,
          encryptControlWire(type, wrapControlInner(token, fields), hash)
        ) ?? false
      );
    },
    []
  );

  const resolveVaultFork = useCallback(
    (action: VaultForkAction) => {
      const prompt = vaultForkPrompt;
      if (!prompt) return;
      const core = coreRef.current;
      if (action === 'use_pwa') {
        core?.allowVaultReplace(prompt.sourceId);
      }
      const sent = sendControlToSource(prompt.sourceId, VAULT_FORK_DECISION_TYPE, { action });
      if (!sent) {
        const t = getLocale(db.settings?.language);
        notifications.toast({
          title: t.alert_error_title,
          message: t.vault_fork_send_failed,
          variant: 'error',
        });
        return;
      }
      if (action === 'use_phone') {
        core?.clearVaultFork(prompt.sourceId);
      }
      setVaultForkPrompt(null);
    },
    [vaultForkPrompt, db.settings?.language, sendControlToSource]
  );

  const resolveActionConfirm = useCallback(
    (ok: boolean, reason?: ActionConfirmDenyReason) => {
      const prompt = actionConfirmPromptRef.current;
      if (!prompt) return;
      const core = coreRef.current;
      const matched =
        core?.completeActionConfirm(prompt.sourceId, prompt.requestId, {
          action: prompt.action,
          ...(prompt.cardId ? { cardId: prompt.cardId } : {}),
        }) ?? false;
      setActionConfirmPrompt(null);
      if (ok && !matched) return;
      const sent = sendControlToSource(prompt.sourceId, ACTION_CONFIRM_RESULT_TYPE, {
        requestId: prompt.requestId,
        action: prompt.action,
        ...(prompt.cardId ? { cardId: prompt.cardId } : {}),
        ok,
        ...(ok ? {} : { reason: reason ?? 'denied' }),
      });
      if (!sent) {
        const t = getLocale(db.settings?.language);
        notifications.toast({
          title: t.alert_error_title,
          message: t.web_action_confirm_send_failed,
          variant: 'error',
        });
      }
    },
    [db.settings?.language, sendControlToSource]
  );

  const beginActionConfirmAuth = useCallback(() => {
    const prompt = actionConfirmPromptRef.current;
    if (!prompt) return;
    const t = getLocale(db.settings?.language);
    void performBiometricOrPasswordCheck(() => {
      resolveActionConfirm(true);
    }, t.require_auth_pwa_action);
  }, [db.settings?.language, performBiometricOrPasswordCheck, resolveActionConfirm]);

  const handleActionConfirmOsIntent = useCallback(
    (kind: 'open' | 'deny', requestId: string | null) => {
      const action = resolvePwaOsIntentAction(
        kind,
        actionConfirmPromptRef.current?.requestId ?? null,
        requestId
      );
      if (action === 'ignore') return;
      if (action === 'expired') {
        const t = getLocale(db.settings?.language);
        notifications.toast({
          title: t.web_pwa_request_expired_title,
          message: t.web_pwa_request_expired_body,
          variant: 'info',
        });
        return;
      }
      if (action === 'deny') {
        resolveActionConfirm(false, 'denied');
      }
    },
    [db.settings?.language, resolveActionConfirm]
  );

  const resolveUnlock = useCallback(
    (ok: boolean) => {
      const prompt = unlockPromptRef.current;
      if (!prompt) return;
      const core = coreRef.current;
      unlockAuthInFlightRef.current = false;
      setUnlockAuthBusy(false);
      setUnlockPrompt(null);
      if (ok) {
        const grant = core?.buildUnlockGrant(prompt.sourceId, prompt.requestId) ?? null;
        if (!grant) return;
        const sent = webServerRef.current?.sendToSourceAny(prompt.sourceId, grant) ?? false;
        if (!sent) {
          const t = getLocale(db.settings?.language);
          notifications.toast({
            title: t.alert_error_title,
            message: t.web_unlock_send_failed,
            variant: 'error',
          });
        }
        return;
      }
      core?.clearUnlock(prompt.sourceId, prompt.requestId);
      const sent =
        webServerRef.current?.sendToSourceAny(prompt.sourceId, {
          type: UNLOCK_CANCEL_TYPE,
          requestId: prompt.requestId,
        }) ?? false;
      if (!sent) {
        const t = getLocale(db.settings?.language);
        notifications.toast({
          title: t.alert_error_title,
          message: t.web_unlock_send_failed,
          variant: 'error',
        });
      }
    },
    [db.settings?.language]
  );

  const beginUnlockAuth = useCallback(() => {
    const prompt = unlockPromptRef.current;
    if (!prompt || unlockAuthInFlightRef.current) return;
    unlockAuthInFlightRef.current = true;
    setUnlockAuthBusy(true);
    const t = getLocale(db.settings?.language);
    void (async () => {
      try {
        await performBiometricOrPasswordCheck(() => {
          resolveUnlock(true);
        }, t.require_auth_web_unlock);
      } finally {
        unlockAuthInFlightRef.current = false;
        setUnlockAuthBusy(false);
      }
    })();
  }, [db.settings?.language, performBiometricOrPasswordCheck, resolveUnlock]);

  const handleUnlockOsIntent = useCallback(
    (kind: 'open' | 'deny', requestId: string | null, options?: { afterVaultUnlock?: boolean }) => {
      const action = resolvePwaOsIntentAction(
        kind,
        unlockPromptRef.current?.requestId ?? null,
        requestId
      );
      if (action === 'ignore') return;
      if (action === 'expired') {
        const t = getLocale(db.settings?.language);
        notifications.toast({
          title: t.web_pwa_request_expired_title,
          message: t.web_pwa_request_expired_body,
          variant: 'info',
        });
        return;
      }
      if (action === 'deny') {
        resolveUnlock(false);
        return;
      }
      if (options?.afterVaultUnlock) {
        void waitForPostBiometricUi().then(() => beginUnlockAuth());
        return;
      }
      beginUnlockAuth();
    },
    [beginUnlockAuth, db.settings?.language, resolveUnlock]
  );

  useEffect(() => {
    if (!actionConfirmPrompt) return;
    const timer = setTimeout(() => {
      const live = actionConfirmPromptRef.current;
      if (!live || live.requestId !== actionConfirmPrompt.requestId) return;
      resolveActionConfirm(false, 'timeout');
    }, ACTION_CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [actionConfirmPrompt, resolveActionConfirm]);

  useEffect(() => {
    if (!unlockPrompt) return;
    const timer = setTimeout(() => {
      const live = unlockPromptRef.current;
      if (!live || live.requestId !== unlockPrompt.requestId) return;
      resolveUnlock(false);
    }, UNLOCK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [unlockPrompt, resolveUnlock]);

  return (
    <SyncContext.Provider
      value={{
        nativeSyncAvailable,
        webServerEnabled,
        webServerBusy,
        webForegroundActive,
        nativeForegroundAvailable: isNativeForegroundServiceAvailable(),
        webKeepAliveMode: getWebKeepAliveMode(),
        enableWebServer,
        disableWebServer,
        webQrUrl,
        webIpUrl,
        webMdnsUrl,
        webPort: WEB_SYNC_PORT,
        localIp,
        mdnsWebAvailable,
        connectedWebClients,
        blockDevice,
        unblockDevice,
        blockedSources,
        blockedIps,
        unblockIp,
        blockWebClient,
        blockClientIdentity,
        webClientAliases,
        setWebClientAlias,
        webReactivatePending,
        dismissWebReactivate,
        reactivateWebServer,
        lanNetwork,
        revealLanSsid,
        vaultForkPrompt,
        resolveVaultFork,
        actionConfirmPrompt,
        resolveActionConfirm,
        beginActionConfirmAuth,
        handleActionConfirmOsIntent,
        unlockPrompt,
        resolveUnlock,
        beginUnlockAuth,
        unlockAuthBusy,
        handleUnlockOsIntent,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};
