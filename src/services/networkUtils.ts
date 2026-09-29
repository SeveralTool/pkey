/**
 * @fileoverview LAN network helpers shared by web access and migration.
 */

export type LanLinkKind = 'wifi' | 'ethernet' | 'cellular' | 'none' | 'other';

export type LanNetworkSnapshot = {
  kind: LanLinkKind;
  isLikelyLan: boolean;
  ip: string | null;
  ssid: string | null;
};

export const EMPTY_LAN_NETWORK: LanNetworkSnapshot = {
  kind: 'none',
  isLikelyLan: false,
  ip: null,
  ssid: null,
};

/** True when two LAN snapshots would paint the same status / QR inputs. */
export function sameLanSnapshot(a: LanNetworkSnapshot, b: LanNetworkSnapshot): boolean {
  return a.kind === b.kind && a.isLikelyLan === b.isLikelyLan && a.ip === b.ip && a.ssid === b.ssid;
}

/** Minimal NetInfo state used by snapshot mapping (avoids `any`). */
export type NetInfoLikeState = {
  type?: string | null;
  isConnected?: boolean | null;
  details?: {
    ipAddress?: string | null;
    ssid?: string | null;
  } | null;
};

type NetInfoApi = {
  fetch: () => Promise<NetInfoLikeState>;
  addEventListener: (listener: (state: NetInfoLikeState) => void) => () => void;
  configure?: (options: { shouldFetchWiFiSSID?: boolean }) => void;
};

let netInfoModule: NetInfoApi | null | undefined;

const getNetInfoModule = (): NetInfoApi | null => {
  if (netInfoModule !== undefined) return netInfoModule;
  try {
    const loaded = require('@react-native-community/netinfo') as {
      default?: NetInfoApi;
    } & Partial<NetInfoApi>;
    const api = loaded.default ?? loaded;
    if (typeof api.fetch !== 'function' || typeof api.addEventListener !== 'function') {
      netInfoModule = null;
      return null;
    }
    // Must run before any listeners. Required for iOS SSID; harmless on Android.
    api.configure?.({ shouldFetchWiFiSSID: true });
    netInfoModule = api as NetInfoApi;
    return netInfoModule;
  } catch {
    netInfoModule = null;
    return null;
  }
};

function parseIpv4Octets(ip: string): [number, number, number, number] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    octets.push(n);
  }
  return octets as [number, number, number, number];
}

/**
 * True for RFC1918 and link-local IPv4. Excludes loopback and CGNAT (`100.64/10`).
 */
export function isLikelyLanIpv4(ip: string | null | undefined): boolean {
  if (!ip) return false;
  const octets = parseIpv4Octets(ip.trim());
  if (!octets) return false;
  const [a, b] = octets;
  if (a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function readDetailString(
  details: NetInfoLikeState['details'],
  key: 'ipAddress' | 'ssid'
): string | null {
  if (!details) return null;
  const raw = details[key];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Android wraps SSID in quotes and uses `<unknown ssid>` when the OS withholds it. */
export function normalizeWifiSsid(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().replace(/^"|"$/g, '').trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower === '<unknown ssid>' || lower === 'unknown ssid' || lower === '0x') return null;
  return value;
}

function kindFromNetInfo(state: NetInfoLikeState | null | undefined): LanLinkKind {
  const type = state?.type ?? '';
  if (type === 'none' || state?.isConnected === false) return 'none';
  if (type === 'wifi') return 'wifi';
  if (type === 'ethernet') return 'ethernet';
  if (type === 'cellular') return 'cellular';
  if (type === 'unknown' && state?.isConnected !== true) return 'none';
  if (!type) return 'none';
  return 'other';
}

/** Maps a NetInfo-like state to a LAN snapshot. Pure; safe to unit-test. */
export function lanSnapshotFromNetInfo(
  state: NetInfoLikeState | null | undefined
): LanNetworkSnapshot {
  const kind = kindFromNetInfo(state);
  const ip = readDetailString(state?.details, 'ipAddress');
  const ssid = kind === 'wifi' ? normalizeWifiSsid(readDetailString(state?.details, 'ssid')) : null;
  return {
    kind,
    ip,
    ssid,
    isLikelyLan: isLikelyLanIpv4(ip),
  };
}

/** Returns the device's current IPv4 from NetInfo, or null if unavailable. */
export const getLocalIp = async (): Promise<string | null> => {
  const snap = await fetchLanNetwork();
  return snap.ip;
};

/** Fetches a one-shot LAN snapshot. */
export async function fetchLanNetwork(): Promise<LanNetworkSnapshot> {
  const ni = getNetInfoModule();
  if (!ni) return EMPTY_LAN_NETWORK;
  try {
    const state = await ni.fetch();
    return lanSnapshotFromNetInfo(state);
  } catch {
    return EMPTY_LAN_NETWORK;
  }
}

/**
 * Subscribes to network changes. Invokes `listener` with the current snapshot
 * as soon as NetInfo answers, then on every change.
 */
export function subscribeLanNetwork(listener: (snapshot: LanNetworkSnapshot) => void): () => void {
  const ni = getNetInfoModule();
  if (!ni) {
    listener(EMPTY_LAN_NETWORK);
    return () => {};
  }

  let cancelled = false;
  void ni
    .fetch()
    .then((state) => {
      if (!cancelled) listener(lanSnapshotFromNetInfo(state));
    })
    .catch(() => {
      if (!cancelled) listener(EMPTY_LAN_NETWORK);
    });

  const unsubscribe = ni.addEventListener((state) => {
    listener(lanSnapshotFromNetInfo(state));
  });

  return () => {
    cancelled = true;
    unsubscribe();
  };
}
