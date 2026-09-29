/**
 * @fileoverview Display labels for LAN web clients (UA summary, alias, IP).
 *
 * Browser-reported strings are untrusted. These helpers only sanitize and
 * summarize for the master's UI — they are never used as auth identity.
 */

/** Max persisted alias length (after trim / control-char strip). */
export const WEB_CLIENT_ALIAS_MAX = 40;
/** Max stored User-Agent length. */
export const WEB_CLIENT_UA_MAX = 512;
/** Max `sourceId` length accepted as an alias map key. */
export const WEB_CLIENT_SOURCE_ID_KEY_MAX = 96;

/** Optional Client Hints surface (Chromium `navigator.userAgentData`). */
export interface BrowserUserAgentData {
  platform?: string;
  brands?: ReadonlyArray<{ brand?: string }>;
}

/** Minimal navigator shape used to compose a UA string without a DOM type. */
export interface BrowserNavigatorLike {
  userAgent?: string;
  userAgentData?: BrowserUserAgentData;
}

/**
 * Strip control characters, collapse whitespace, and clamp length.
 *
 * @param value - Untrusted input.
 * @param max - Maximum length after cleanup.
 * @returns Sanitized string (possibly empty).
 */
export function sanitizeDisplayText(value: unknown, max: number): string {
  if (typeof value !== 'string' || !Number.isFinite(max) || max <= 0) return '';
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, max);
}

/**
 * Sanitize a raw User-Agent (or composed UA) for storage.
 *
 * @param value - Header or JSON field from the client.
 * @returns Sanitized UA, or `null` when empty / invalid.
 */
export function sanitizeUserAgent(value: unknown): string | null {
  const text = sanitizeDisplayText(value, WEB_CLIENT_UA_MAX);
  return text || null;
}

/**
 * Sanitize a user-chosen alias. Empty string means “no alias”.
 *
 * @param value - Prompt input.
 * @returns Clamped alias (empty if none).
 */
export function sanitizeWebClientAlias(value: unknown): string {
  return sanitizeDisplayText(value, WEB_CLIENT_ALIAS_MAX);
}

/**
 * True when `sourceId` is safe to use as a persistence key.
 *
 * @param sourceId - Client-provided source id.
 */
export function isPersistableSourceId(sourceId: string | null | undefined): sourceId is string {
  if (!sourceId || typeof sourceId !== 'string') return false;
  if (sourceId.length > WEB_CLIENT_SOURCE_ID_KEY_MAX) return false;
  if (sourceId.startsWith('probe-')) return false;
  if (sourceId === 'web-unknown') return false;
  return sanitizeDisplayText(sourceId, WEB_CLIENT_SOURCE_ID_KEY_MAX) === sourceId;
}

/**
 * Normalize a socket `remoteAddress` for display (mapped IPv4, zone id).
 *
 * @param ip - Raw remote address.
 * @returns Display IP, or `null` when missing.
 */
export function formatClientIp(ip: string | null | undefined): string | null {
  if (typeof ip !== 'string') return null;
  let value = ip.trim();
  if (!value) return null;
  if (value.toLowerCase().startsWith('::ffff:')) value = value.slice(7);
  const zone = value.indexOf('%');
  if (zone >= 0) value = value.slice(0, zone);
  value = value.replace(/^\[|\]$/g, '');
  return value.trim() || null;
}

/**
 * True when another live web client uses the same LAN IP as `targetIp` but a
 * different `sourceId`. Blocking that IP would drop those other browsers.
 */
export function otherLiveClientsShareIp(
  targetIp: string | null | undefined,
  targetSourceId: string | null | undefined,
  liveClients: ReadonlyArray<{ sourceId?: string | null; ip?: string | null }>
): boolean {
  const ip = formatClientIp(targetIp);
  if (!ip) return false;
  const sid = targetSourceId?.trim() || null;
  return liveClients.some((client) => {
    if (formatClientIp(client.ip) !== ip) return false;
    const clientSid = client.sourceId?.trim() || null;
    if (sid && clientSid === sid) return false;
    return true;
  });
}

/**
 * Append Chromium Client Hints so reduced UAs still name browser + OS.
 *
 * @param nav - `navigator` or a test double.
 * @returns Composed string (may be empty).
 */
export function composeBrowserUserAgent(nav?: BrowserNavigatorLike | null): string {
  const ua = typeof nav?.userAgent === 'string' ? nav.userAgent : '';
  const data = nav?.userAgentData;
  if (!data) return ua;
  const brand = (data.brands ?? [])
    .map((entry) => (typeof entry?.brand === 'string' ? entry.brand.trim() : ''))
    .find((name) => name && !/not.?a.?brand/i.test(name) && name.toLowerCase() !== 'chromium');
  const platform = typeof data.platform === 'string' ? data.platform.trim() : '';
  const extras = [
    platform ? `CHPlatform/${tokenHint(platform)}` : '',
    brand ? `CHBrand/${tokenHint(brand)}` : '',
  ].filter(Boolean);
  if (extras.length === 0) return ua;
  return `${ua} ${extras.join(' ')}`.trim();
}

/**
 * Human-readable “Chrome · Windows” summary, or `null` if nothing useful.
 *
 * @param ua - Sanitized User-Agent (possibly with CHPlatform/CHBrand tokens).
 */
export function summarizeUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const browser = detectBrowser(ua);
  const os = detectOs(ua);
  if (browser && os) return `${browser} · ${os}`;
  return browser || os || null;
}

/**
 * Primary list title: alias, then UA summary, then source id.
 *
 * @param opts - Label inputs (alias is master-local, not from the client).
 */
export function webClientPrimaryLabel(opts: {
  alias?: string | null;
  userAgent?: string | null;
  sourceId?: string | null;
  socketId?: string | null;
  fallback?: string;
}): string {
  const alias = opts.alias?.trim();
  if (alias) return alias;
  const summary = summarizeUserAgent(opts.userAgent);
  if (summary) return summary;
  if (opts.sourceId) return opts.sourceId;
  if (opts.socketId) return opts.socketId;
  return opts.fallback || 'web';
}

/**
 * Secondary line: IP, plus UA summary when the title is an alias.
 *
 * @param opts - Same identity fields as the primary label.
 */
export function webClientSecondaryLine(opts: {
  alias?: string | null;
  userAgent?: string | null;
  ip?: string | null;
}): string | null {
  const ip = formatClientIp(opts.ip);
  const summary = summarizeUserAgent(opts.userAgent);
  const alias = opts.alias?.trim();
  const parts: string[] = [];
  if (ip) parts.push(ip);
  if (alias && summary) parts.push(summary);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Notification / compact label: alias → UA → IP → truncated id.
 *
 * @param opts - Identity fields.
 */
export function webClientNotifyLabel(opts: {
  alias?: string | null;
  userAgent?: string | null;
  ip?: string | null;
  sourceId?: string | null;
  socketId?: string | null;
}): string {
  const alias = opts.alias?.trim();
  if (alias) return alias;
  const summary = summarizeUserAgent(opts.userAgent);
  if (summary) return summary;
  const ip = formatClientIp(opts.ip);
  if (ip) return ip;
  const id = opts.sourceId || opts.socketId || '';
  return id.slice(0, 12) || 'web';
}

/**
 * Lock-screen / OS tray label: alias or UA summary only (never IP or raw ids).
 */
export function webClientOsNotifyLabel(opts: {
  alias?: string | null;
  userAgent?: string | null;
  fallback?: string;
}): string {
  const alias = opts.alias?.trim();
  if (alias) return alias;
  const summary = summarizeUserAgent(opts.userAgent);
  if (summary) return summary;
  return opts.fallback?.trim() || 'web';
}

function tokenHint(value: string): string {
  return value
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 32);
}

function chBrand(ua: string): string | null {
  const match = /CHBrand\/([A-Za-z0-9.\- ]+)/.exec(ua);
  if (!match) return null;
  return normalizeBrowserName(match[1].trim());
}

function chPlatform(ua: string): string | null {
  const match = /CHPlatform\/([A-Za-z0-9.\- ]+)/.exec(ua);
  if (!match) return null;
  return normalizeOsName(match[1].trim());
}

function detectBrowser(ua: string): string | null {
  const fromCh = chBrand(ua);
  if (fromCh) return fromCh;
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/Edg(?:e|A|iOS)?\//i.test(ua)) return 'Edge';
  if (/OPR\/|Opera/i.test(ua)) return 'Opera';
  if (/Firefox\/|FxiOS\//i.test(ua)) return 'Firefox';
  if (/CriOS\//i.test(ua)) return 'Chrome';
  if (/DuckDuckGo/i.test(ua)) return 'DuckDuckGo';
  if (/Brave/i.test(ua) || /CHBrand\/Brave/i.test(ua)) return 'Brave';
  if (/Chrome\//i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua) && !/Chrome\/|Chromium\/|Android/i.test(ua)) return 'Safari';
  return null;
}

function detectOs(ua: string): string | null {
  const fromCh = chPlatform(ua);
  if (fromCh) return fromCh;
  if (/iPad/i.test(ua)) return 'iPadOS';
  if (/iPhone|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/CrOS/i.test(ua)) return 'Chrome OS';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return null;
}

function normalizeBrowserName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('edge')) return 'Edge';
  if (lower.includes('opera')) return 'Opera';
  if (lower.includes('firefox')) return 'Firefox';
  if (lower.includes('safari')) return 'Safari';
  if (lower.includes('brave')) return 'Brave';
  if (lower.includes('samsung')) return 'Samsung Internet';
  if (lower.includes('chrome') || lower.includes('google')) return 'Chrome';
  return name.slice(0, 24);
}

function normalizeOsName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('ipad')) return 'iPadOS';
  if (lower === 'ios' || lower.includes('iphone')) return 'iOS';
  if (lower.includes('android')) return 'Android';
  if (lower.includes('win')) return 'Windows';
  if (lower.includes('mac') || lower.includes('darwin')) return 'macOS';
  if (lower.includes('cros') || lower.includes('chrome os')) return 'Chrome OS';
  if (lower.includes('linux')) return 'Linux';
  return name.slice(0, 24);
}
