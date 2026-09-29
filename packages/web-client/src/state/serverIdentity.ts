/**
 * @fileoverview Persistent identity of the PKEY master this browser knows, plus
 * the same-origin `/pkey/meta` fetcher and the write rules that prevent races
 * between a background meta refresh and a live connection.
 *
 * The identity lives under the page origin (localStorage), so a reconnection
 * never navigates away and never loses the stored `outbox`/`offlineVault`.
 * The vault `salt` pins which vault we expect. The optional `hostProofSecret`
 * is a random pairing token (not the master password) used to verify a host
 * discovered after an IP change — see `masterProof.ts`.
 */

import {
  sanitizePublicSessionId,
  sanitizeSessionCreatedAt,
  normalizeHostProofSecret,
} from '@pkey/core';

/** Identity document as stored and used by the PWA. */
export interface ServerIdentity {
  /** Stable per-install master id (`/pkey/meta.deviceId`). */
  deviceId: string;
  /** Stable mDNS host with `.local` suffix ('' when unknown). */
  mdnsHost: string;
  /** Last known LAN IPv4 of the master ('' when unknown). */
  ip: string;
  /** Vault salt seen in the last successful session ('' when never authenticated). */
  salt: string;
  /**
   * Random host-pairing secret from encrypted `auth_ok`. Lets discovery verify
   * the master without an HMAC under the vault auth verifier. Empty until the
   * first successful login with a current master.
   */
  hostProofSecret?: string;
  /** Epoch ms of the meta payload the server generated. */
  generatedAt: number;
  /** Epoch ms when this identity was last persisted locally. */
  updatedAt: number;
  /** Epoch ms of the last authenticated WebSocket against this master. */
  lastSuccessAt: number;
  /** Last advertised vault language (not a credential; used for pre-auth chrome). */
  language?: 'ESP' | 'ING' | 'AUTO';
  /** Last advertised vault theme (not a credential; used for pre-auth chrome). */
  theme?: 'LIGHT' | 'DARK' | 'AUTO';
  /** Public vault session id from `/pkey/meta` (hex; not a secret). */
  sessionId?: string;
  /** Vault creation date from `/pkey/meta` (ISO-8601). */
  sessionCreatedAt?: string;
  /** Advertised pre-auth fingerprint login (not a credential). */
  webLoginOnPhone?: boolean;
}

const KEY = '@pkey/server-identity';
const META_VERSION = 1;

const IPV4_RE = /^(\d{1,3})(?:\.(\d{1,3})){3}$/;

/** True when `host` is a syntactically valid IPv4 address. */
export function isIpv4Host(host: string): boolean {
  if (!IPV4_RE.test(host)) return false;
  return host.split('.').every((p) => Number(p) <= 255);
}

function sanitizeIp(raw: string): string {
  return isIpv4Host(raw || '') ? raw : '';
}

function sanitizeMdns(raw: string): string {
  let h = (raw || '').trim().toLowerCase();
  h = h.replace(/^[a-z]+:\/\//, '');
  h = h.split('/')[0] ?? '';
  const colon = h.lastIndexOf(':');
  let port = '';
  if (colon > 0 && /^\d+$/.test(h.slice(colon + 1))) {
    port = h.slice(colon + 1);
    h = h.slice(0, colon);
  }
  if (!h) return '';
  // A bare IPv4 is not a stable name (`ip` already carries it). An explicit
  // port is an override target (e2e two-port reconnect), not a Bonjour name.
  if (isIpv4Host(h)) return port ? `${h}:${port}` : '';
  return port ? `${h}:${port}` : h;
}

function readUiPrefs(raw: {
  language?: unknown;
  theme?: unknown;
  sessionId?: unknown;
  sessionCreatedAt?: unknown;
  webLoginOnPhone?: unknown;
}): Pick<
  ServerIdentity,
  'language' | 'theme' | 'sessionId' | 'sessionCreatedAt' | 'webLoginOnPhone'
> {
  const language =
    raw.language === 'ESP' || raw.language === 'ING' || raw.language === 'AUTO'
      ? raw.language
      : undefined;
  const theme =
    raw.theme === 'LIGHT' || raw.theme === 'DARK' || raw.theme === 'AUTO' ? raw.theme : undefined;
  const sessionId = sanitizePublicSessionId(raw.sessionId);
  const sessionCreatedAt = sanitizeSessionCreatedAt(raw.sessionCreatedAt);
  return {
    ...(language ? { language } : {}),
    ...(theme ? { theme } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(sessionCreatedAt ? { sessionCreatedAt } : {}),
    webLoginOnPhone: raw.webLoginOnPhone === true,
  };
}

/** Loads the persisted identity; returns null when absent or corrupted. */
export function loadIdentity(): ServerIdentity | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<ServerIdentity>;
    if (typeof p.deviceId !== 'string' || !p.deviceId) return null;
    const hostProofSecret = normalizeHostProofSecret(p.hostProofSecret);
    return {
      deviceId: p.deviceId.slice(0, 128),
      mdnsHost: sanitizeMdns(p.mdnsHost ?? ''),
      ip: sanitizeIp(p.ip ?? ''),
      salt: typeof p.salt === 'string' ? p.salt.slice(0, 256) : '',
      generatedAt: typeof p.generatedAt === 'number' ? p.generatedAt : 0,
      updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : Date.now(),
      lastSuccessAt: typeof p.lastSuccessAt === 'number' ? p.lastSuccessAt : 0,
      ...readUiPrefs(p),
      ...(hostProofSecret ? { hostProofSecret } : {}),
    };
  } catch {
    return null;
  }
}

/** Persists the identity under the page origin. */
export function saveIdentity(identity: ServerIdentity): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const next = { ...identity, updatedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full/unavailable — discovery falls back to best-effort */
  }
}

/** Removes the persisted identity (explicit "forget this master"). */
export function clearIdentity(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Returns a copy of `identity` stamped as successfully reached: when `host` is
 * an IPv4 it becomes the new `ip`, `salt` is pinned when given, and
 * `lastSuccessAt` is bumped. Returns null when `identity` is null (caller keeps
 * the previous value).
 */
export function touchIdentitySuccess(
  identity: ServerIdentity | null,
  host: string,
  salt = ''
): ServerIdentity | null {
  if (!identity) return null;
  const hostOnly = (host || '').split(':')[0] ?? '';
  const next: ServerIdentity = { ...identity, lastSuccessAt: Date.now() };
  if (isIpv4Host(hostOnly)) {
    next.ip = hostOnly;
  } else if (hostOnly) {
    const mdns = sanitizeMdns(hostOnly);
    if (mdns) next.mdnsHost = mdns;
  }
  if (salt) next.salt = salt;
  return next;
}

/**
 * Pure rule deciding whether a background meta refresh may replace the current
 * identity. Guards the race where a sweep already found a NEW ip while a stale
 * meta (fired before the sweep) resolves afterwards.
 *
 * @param current - Identity in memory (may be null).
 * @param meta - Fresh meta fetched from the network.
 * @param isLiveConnected - True when an authenticated WS is currently open.
 */
export function shouldApplyMeta(
  current: ServerIdentity | null,
  meta: ServerIdentity | null,
  isLiveConnected: boolean
): boolean {
  if (!meta) return false;
  if (isLiveConnected) return false;
  if (!current) return true;
  return current.deviceId === meta.deviceId;
}

/**
 * Normalizes a raw `/pkey/meta` body into a {@link ServerIdentity}, preserving
 * `salt` and `lastSuccessAt` when the deviceId matches the previous identity.
 */
export function normalizeMeta(body: unknown, prev: ServerIdentity | null): ServerIdentity | null {
  if (typeof body !== 'object' || body === null) return null;
  const p = body as {
    metaVersion?: unknown;
    deviceId?: unknown;
    mdnsHost?: unknown;
    ip?: unknown;
    generatedAt?: unknown;
    language?: unknown;
    theme?: unknown;
    sessionId?: unknown;
    sessionCreatedAt?: unknown;
    webLoginOnPhone?: unknown;
  };
  if (p.metaVersion !== META_VERSION) return null;
  if (typeof p.deviceId !== 'string' || !p.deviceId) return null;
  const deviceId = p.deviceId.slice(0, 128);
  const sameMaster = !!prev && prev.deviceId === deviceId;
  const hostProofSecret = sameMaster ? normalizeHostProofSecret(prev!.hostProofSecret) : undefined;
  const fromMeta = sanitizeMdns(typeof p.mdnsHost === 'string' ? p.mdnsHost : '');
  return {
    deviceId,
    // An empty meta (publish still racing) must not wipe a hostname we already know.
    mdnsHost: fromMeta || (sameMaster ? prev!.mdnsHost : ''),
    ip: sanitizeIp(typeof p.ip === 'string' ? p.ip : ''),
    salt: sameMaster ? prev!.salt : '',
    generatedAt: typeof p.generatedAt === 'number' ? p.generatedAt : Date.now(),
    updatedAt: Date.now(),
    lastSuccessAt: sameMaster ? prev!.lastSuccessAt : 0,
    ...readUiPrefs(p),
    ...(hostProofSecret ? { hostProofSecret } : {}),
  };
}

/**
 * Fetches the master identity from the page's own origin with a hard timeout.
 * Same-origin on purpose: it keeps the document CSP at `connect-src 'self' ws:`
 * (no cross-origin fetch, no CORS on the master).
 *
 * @param timeoutMs - Abort deadline (default 3000).
 * @param prev - Previous identity (preserves `salt`/`lastSuccessAt`).
 */
export async function fetchMeta(
  timeoutMs = 3000,
  prev: ServerIdentity | null = null
): Promise<ServerIdentity | null> {
  if (typeof fetch !== 'function') return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('/pkey/meta', { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as unknown;
    return normalizeMeta(body, prev);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
