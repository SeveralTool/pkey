import { parseLinkIdentity } from '../links/parse';
import { collectIdentities } from '../links/identities';

/**
 * Extracts a hostname from a URL-like string (strips leading `www.`).
 *
 * @param url - URL or host string (scheme optional).
 * @returns Hostname without `www.`, or `null` if unparseable / empty.
 */
export function extractDomain(url: string): string | null {
  if (!url) return null;
  try {
    let clean = url.trim();
    if (!/^https?:\/\//i.test(clean)) clean = `http://${clean}`;
    const parsed = new URL(clean);
    let hostname = parsed.hostname;
    if (hostname.startsWith('www.')) hostname = hostname.slice(4);
    return hostname;
  } catch {
    return null;
  }
}

/**
 * Heuristic emoji for a card based on title/link keywords (web UI flourishes).
 *
 * @param title - Card title.
 * @param link - Optional URL.
 * @returns Single emoji string.
 */
export function guessEmoji(title: string, link?: string): string {
  const t = `${title} ${link ?? ''}`.toLowerCase();
  if (t.includes('github')) return '🐙';
  if (t.includes('google') || t.includes('gmail')) return '🌐';
  if (t.includes('twitter') || t.includes('x.com')) return '🐦';
  if (t.includes('facebook') || t.includes('instagram')) return '📘';
  if (t.includes('amazon') || t.includes('aws')) return '📦';
  if (t.includes('apple') || t.includes('icloud')) return '🍎';
  if (t.includes('bank') || t.includes('crypto') || t.includes('wallet')) return '💰';
  if (t.includes('email') || t.includes('mail') || t.includes('smtp')) return '✉️';
  return '🔑';
}

/**
 * Copies text to the clipboard (Clipboard API with `execCommand` fallback).
 *
 * @param text - Text to copy.
 * @returns Resolves when copy succeeds.
 * @throws {Error} If both clipboard APIs fail.
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(textArea);
  if (!ok) throw new Error('Copy failed');
}

/** Default auto-clear window for secrets copied in the PWA (matches mobile). */
export const WEB_CLIPBOARD_CLEAR_MS = 30_000;

let webClipboardClearTimer: ReturnType<typeof setTimeout> | null = null;
let webClipboardLastValue: string | null = null;

/**
 * Copies a secret and schedules a clear (~30s) if the clipboard still holds
 * the same value. Concurrent copies reset the timer.
 */
export async function copySecretToClipboard(
  text: string,
  clearAfterMs: number = WEB_CLIPBOARD_CLEAR_MS
): Promise<void> {
  const value = typeof text === 'string' ? text : '';
  if (!value) return;
  await copyToClipboard(value);
  webClipboardLastValue = value;
  if (webClipboardClearTimer) clearTimeout(webClipboardClearTimer);
  const delay = Math.max(1_000, clearAfterMs);
  webClipboardClearTimer = setTimeout(() => {
    webClipboardClearTimer = null;
    void (async () => {
      try {
        if (navigator.clipboard?.readText) {
          const current = await navigator.clipboard.readText();
          if (current !== webClipboardLastValue) return;
        }
        await copyToClipboard('');
        webClipboardLastValue = null;
      } catch {
        /* clipboard read may be denied — best-effort clear only */
      }
    })();
  }, delay);
}

/**
 * Builds a `:root { --css-vars }` stylesheet snippet for light or dark theme.
 *
 * @param isDark - When `true`, emit dark palette variables.
 * @returns CSS string suitable for injecting into the document.
 */
export function themeCssVars(isDark: boolean): string {
  const d = {
    bg: '#121212',
    surface: '#1E1E1E',
    text: '#E0E4E8',
    muted: '#A0A0A0',
    border: '#333333',
    accent: '#87cb28',
    accentHover: '#6BBF78',
    success: '#87cb28',
    warning: '#FFCA28',
    danger: '#D75A4D',
  };
  const l = {
    bg: '#F0F2F5',
    surface: '#FFFFFF',
    text: '#2D3A3F',
    muted: '#6A6A6A',
    border: '#E0E0E0',
    accent: '#87cb28',
    accentHover: '#6BBF78',
    success: '#87cb28',
    warning: '#FFC107',
    danger: '#D75A4D',
  };
  const c = isDark ? d : l;
  return `:root{--bg:${c.bg};--surface:${c.surface};--text:${c.text};--muted:${c.muted};--border:${c.border};--accent:${c.accent};--accent-hover:${c.accentHover};--success:${c.success};--warning:${c.warning};--danger:${c.danger};--radius:14px;--font:system-ui,sans-serif}`;
}

const BLOCKED_OPEN_SCHEME = /^(javascript|data|file|vbscript|blob):/i;
const EXPLICIT_OPEN_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const BROWSER_OPEN_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

/**
 * Normalizes a user-entered link into a URL safe to pass to `window.open`.
 * Adds `https://` when no scheme is present. Blocks `javascript:` / `data:` /
 * `file:` / `vbscript:` / `blob:` and unknown schemes.
 *
 * @param raw - Raw link field.
 * @returns Openable URL, or `null` when empty/blocked/invalid.
 */
export function normalizeSafeOpenUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (BLOCKED_OPEN_SCHEME.test(trimmed)) return null;
  if (EXPLICIT_OPEN_SCHEME.test(trimmed)) {
    const scheme = trimmed.split(':')[0]?.toLowerCase() ?? '';
    if (BROWSER_OPEN_SCHEMES.has(scheme)) return trimmed;
    const id = parseLinkIdentity(trimmed);
    if (id && (id.kind === 'android_package' || id.kind === 'ios_app')) {
      if (id.browserFallbackUrl && /^https?:\/\//i.test(id.browserFallbackUrl)) {
        return id.browserFallbackUrl;
      }
      if (id.host) return `https://${id.host}`;
      return null;
    }
    return null;
  }
  return `https://${trimmed}`;
}

/**
 * First URL safe to pass to `window.open` from a card's `link` + extra `uris`.
 * Never returns `android://` / `javascript:` / other blocked schemes.
 */
export function resolveOpenableUrl(link: string, uris?: readonly string[]): string | null {
  const candidates = [link, ...(uris ?? [])];
  for (const raw of candidates) {
    const url = normalizeSafeOpenUrl(raw);
    if (url) return url;
  }
  for (const id of collectIdentities(link, uris)) {
    if (id.browserFallbackUrl) {
      const url = normalizeSafeOpenUrl(id.browserFallbackUrl);
      if (url) return url;
    }
    if (id.host) {
      const url = normalizeSafeOpenUrl(`https://${id.host}`);
      if (url) return url;
    }
  }
  return null;
}
