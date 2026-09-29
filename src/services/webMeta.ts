/**
 * @fileoverview Pure helpers for the web-access identity endpoint
 * `GET /pkey/meta`, consumed same-origin by the PWA on page load.
 *
 * The document is not a credential: it only tells the browser which stable
 * hostname (mDNS) and which LAN IP the master had, so the PWA can rotate its
 * WebSocket target after a DHCP IP change. Identity of a rotated host is proven
 * inside the WebSocket handshake (pinned salt + server proof), never here.
 */

import { sanitizePublicSessionId, sanitizeSessionCreatedAt } from '@pkey/core';

/** Schema version of the `/pkey/meta` document. Bump on breaking changes. */
export const WEB_META_VERSION = 1;

/** Identity document served by the master at `GET /pkey/meta`. */
export interface WebMetaPayload {
  metaVersion: number;
  /** Stable per-install master id (lets browsers ignore a foreign master). */
  deviceId: string;
  /** Stable mDNS host with `.local` suffix (`pkey-android-abcd.local`), may be ''. */
  mdnsHost: string;
  /** Current LAN IPv4 of the master, may be '' when resolution failed. */
  ip: string;
  /** Epoch ms when the payload was built. */
  generatedAt: number;
  /**
   * Vault UI language. Not a credential — advertised so the PWA login chrome
   * can match the master before unlock. Omitted when the vault is unavailable.
   */
  language?: 'ESP' | 'ING' | 'AUTO';
  /**
   * Vault theme preference. Same non-secret hint as `language`.
   */
  theme?: 'LIGHT' | 'DARK' | 'AUTO';
  /**
   * Public vault session id (8–32 hex). Lets the user compare phone vs PWA.
   * Derived from passwordHash + creation date — not the master password.
   */
  sessionId?: string;
  /** Vault `creation_date` as ISO-8601. Same non-secret hint as `sessionId`. */
  sessionCreatedAt?: string;
  /**
   * When true, the PWA may show a fingerprint login button. Not a credential.
   */
  webLoginOnPhone?: boolean;
}

const IPV4_RE = /^(\d{1,3})(?:\.(\d{1,3})){3}$/;

/** True when `ip` is a syntactically valid IPv4 address. */
export function isValidIpv4(ip: string): boolean {
  if (!IPV4_RE.test(ip)) return false;
  return ip.split('.').every((p) => Number(p) <= 255);
}

/**
 * Strips scheme/port/path from a raw host string and normalizes casing.
 * An IPv4 literal is rejected ('') — it is not a stable name, and the `ip`
 * field already carries it.
 */
export function sanitizeMdnsHost(raw: string): string {
  let h = (raw || '').trim().toLowerCase();
  h = h.replace(/^[a-z]+:\/\//, '');
  h = h.split('/')[0] ?? '';
  h = h.split(':')[0] ?? '';
  if (!h) return '';
  if (isValidIpv4(h)) return '';
  if (!h.endsWith('.local')) h = `${h}.local`;
  return h;
}

/**
 * Builds a validated `/pkey/meta` payload. Invalid inputs degrade to safe
 * defaults ('' for ip/mdnsHost) instead of throwing, so the endpoint can never
 * break the handshake of a healthy PWA session.
 */
export function buildMetaPayload(input: {
  deviceId: string;
  mdnsHost: string;
  ip: string;
  now?: number;
  language?: 'ESP' | 'ING' | 'AUTO';
  theme?: 'LIGHT' | 'DARK' | 'AUTO';
  sessionId?: string;
  sessionCreatedAt?: string;
  webLoginOnPhone?: boolean;
}): WebMetaPayload {
  const language =
    input.language === 'ESP' || input.language === 'ING' || input.language === 'AUTO'
      ? input.language
      : undefined;
  const theme =
    input.theme === 'LIGHT' || input.theme === 'DARK' || input.theme === 'AUTO'
      ? input.theme
      : undefined;
  const sessionId = sanitizePublicSessionId(input.sessionId);
  const sessionCreatedAt = sanitizeSessionCreatedAt(input.sessionCreatedAt);
  return {
    metaVersion: WEB_META_VERSION,
    deviceId: (input.deviceId || '').slice(0, 128),
    mdnsHost: sanitizeMdnsHost(input.mdnsHost),
    ip: isValidIpv4(input.ip || '') ? input.ip : '',
    generatedAt: input.now ?? Date.now(),
    ...(language ? { language } : {}),
    ...(theme ? { theme } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(sessionCreatedAt ? { sessionCreatedAt } : {}),
    ...(input.webLoginOnPhone === true ? { webLoginOnPhone: true } : {}),
  };
}
