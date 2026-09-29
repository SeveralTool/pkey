/**
 * @fileoverview Last advertised LAN identity for web access (SSID + IPv4).
 *
 * Used to detect Wi-Fi / DHCP moves while the server is running so the user
 * can copy the address again from Security. Not a secret — AsyncStorage is enough.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LanNetworkSnapshot } from './networkUtils';
import { isLikelyLanIpv4 } from './networkUtils';

/** AsyncStorage key for the last advertised web-access LAN address. */
export const SK_WEB_LAN_ANCHOR = '@pkey/web_lan_anchor';

/** Minimum gap between OS/in-app address-change alerts. */
export const WEB_LAN_NOTIFY_COOLDOWN_MS = 60_000;
/** Wait for NetInfo to settle after a roam before classifying. */
export const WEB_LAN_CHANGE_DEBOUNCE_MS = 2_000;

/** Last SSID + IPv4 shown on the web-access card / QR. */
export type WebLanAnchor = {
  ip: string;
  ssid: string | null;
};

export type LanChangeKind = 'none' | 'seed' | 'ip' | 'network' | 'lost';

export type WebLanAnchorDecision =
  | { action: 'ignore' }
  | { action: 'seed'; anchor: WebLanAnchor }
  | { action: 'notify'; anchor: WebLanAnchor }
  | { action: 'silent-adopt'; anchor: WebLanAnchor };

const IPV4_RE = /^(\d{1,3})(?:\.(\d{1,3})){3}$/;

function isIpv4(ip: string): boolean {
  if (!IPV4_RE.test(ip)) return false;
  return ip.split('.').every((p) => Number(p) <= 255);
}

/**
 * Validates a stored or in-memory anchor. Returns null when the payload is
 * missing, corrupted, or not a LAN IPv4.
 */
export function parseWebLanAnchor(raw: unknown): WebLanAnchor | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as { ip?: unknown; ssid?: unknown };
  if (typeof rec.ip !== 'string' || !isIpv4(rec.ip.trim()) || !isLikelyLanIpv4(rec.ip.trim())) {
    return null;
  }
  const ip = rec.ip.trim();
  let ssid: string | null = null;
  if (typeof rec.ssid === 'string') {
    const trimmed = rec.ssid.trim();
    ssid = trimmed.length > 0 ? trimmed.slice(0, 128) : null;
  }
  return { ip, ssid };
}

/** Anchor for a usable LAN snapshot, or null when the phone is off-LAN. */
export function anchorFromSnapshot(snap: LanNetworkSnapshot): WebLanAnchor | null {
  if (!snap.isLikelyLan || !snap.ip || !isLikelyLanIpv4(snap.ip)) return null;
  return { ip: snap.ip, ssid: snap.ssid };
}

/**
 * Classifies a NetInfo snapshot against the last advertised LAN address.
 * Non-LAN snapshots keep the previous anchor (`lost`) so a later return with
 * a new DHCP lease still compares correctly.
 */
export function classifyLanChange(
  prev: WebLanAnchor | null,
  snap: LanNetworkSnapshot
): LanChangeKind {
  const next = anchorFromSnapshot(snap);
  if (!next) return prev ? 'lost' : 'none';
  if (!prev) return 'seed';
  if (next.ip === prev.ip) return 'none';
  if (next.ssid && prev.ssid && next.ssid !== prev.ssid) return 'network';
  return 'ip';
}

/**
 * True when an address-change alert should fire (server on, no live browsers,
 * IP or network moved, cooldown elapsed).
 */
export function shouldNotifyWebAddressChange(opts: {
  kind: LanChangeKind;
  serverOn: boolean;
  authenticatedCount: number;
  lastNotifyAt: number;
  now?: number;
}): boolean {
  if (!opts.serverOn) return false;
  if (opts.authenticatedCount > 0) return false;
  if (opts.kind !== 'ip' && opts.kind !== 'network') return false;
  const now = opts.now ?? Date.now();
  if (opts.lastNotifyAt > 0 && now - opts.lastNotifyAt < WEB_LAN_NOTIFY_COOLDOWN_MS) {
    return false;
  }
  return true;
}

/**
 * Single decision for SyncContext: seed on first LAN, notify or silently
 * adopt on IP/SSID change, ignore lost LAN and cooldown flaps.
 */
export function decideWebLanAnchorUpdate(opts: {
  prev: WebLanAnchor | null;
  snap: LanNetworkSnapshot;
  serverOn: boolean;
  authenticatedCount: number;
  lastNotifyAt: number;
  now?: number;
}): WebLanAnchorDecision {
  if (!opts.serverOn) return { action: 'ignore' };
  const kind = classifyLanChange(opts.prev, opts.snap);
  const next = anchorFromSnapshot(opts.snap);
  if (!next) return { action: 'ignore' };
  if (kind === 'none' || kind === 'lost') return { action: 'ignore' };
  if (kind === 'seed') return { action: 'seed', anchor: next };
  if (opts.authenticatedCount > 0) return { action: 'silent-adopt', anchor: next };
  if (
    !shouldNotifyWebAddressChange({
      kind,
      serverOn: true,
      authenticatedCount: 0,
      lastNotifyAt: opts.lastNotifyAt,
      now: opts.now,
    })
  ) {
    return { action: 'ignore' };
  }
  return { action: 'notify', anchor: next };
}

/** Loads the persisted anchor, or null. */
export async function loadWebLanAnchor(): Promise<WebLanAnchor | null> {
  try {
    const raw = await AsyncStorage.getItem(SK_WEB_LAN_ANCHOR);
    if (!raw) return null;
    return parseWebLanAnchor(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/** Persists the advertised LAN identity. */
export async function saveWebLanAnchor(anchor: WebLanAnchor): Promise<void> {
  const parsed = parseWebLanAnchor(anchor);
  if (!parsed) return;
  try {
    await AsyncStorage.setItem(SK_WEB_LAN_ANCHOR, JSON.stringify(parsed));
  } catch {
    /* storage full — in-memory ref still works for this session */
  }
}

/** Drops the advertised LAN identity (web access turned off). */
export async function clearWebLanAnchor(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SK_WEB_LAN_ANCHOR);
  } catch {
    /* ignore */
  }
}
