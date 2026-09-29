/**
 * @fileoverview Web vault loader — serves the Vite single-file bundle embedded at build time
 * and injects per-request Content-Security-Policy nonces plus non-secret boot UI prefs.
 */
import { htmlLangAttr, type AppLanguage } from '@pkey/core';

type PwaAssetEntry = { mime: string; body: string };

let embeddedHtml: string | null = null;
let embeddedAssets: Record<string, PwaAssetEntry> | null = null;

/** Evaluates the embedded HTML shell on first web request, not at app startup. */
function loadEmbeddedHtml(): string {
  if (embeddedHtml === null) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    embeddedHtml = (require('./generated/pwaHtml') as { PWA_HTML: string }).PWA_HTML;
  }
  return embeddedHtml;
}

/** Evaluates embedded static assets on first lookup, not at app startup. */
function loadEmbeddedAssets(): Record<string, PwaAssetEntry> {
  if (embeddedAssets === null) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    embeddedAssets = (
      require('./generated/pwaAssets') as { PWA_ASSETS: Record<string, PwaAssetEntry> }
    ).PWA_ASSETS;
  }
  return embeddedAssets;
}

/** Embedded static file served next to the PWA HTML shell. */
export interface PwaStaticAsset {
  mime: string;
  body: Buffer;
}

/** Non-secret UI hints injected into the PWA shell so login matches the master. */
export interface PwaBootUi {
  language: AppLanguage;
  theme: 'LIGHT' | 'DARK' | 'AUTO';
  webLoginOnPhone?: boolean;
}

/**
 * Injects a per-request CSP nonce into inline script/style tags and strips any static CSP meta tag.
 *
 * @param html - Embedded HTML shell
 * @param host - Bind host (reserved for future CSP host allowlists)
 * @param port - Listen port (reserved for future CSP host allowlists)
 * @param nonce - Cryptographic nonce for this response
 */
export function injectPwaCsp(html: string, host: string, port: number, nonce: string): string {
  let out = html.replace(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');
  out = out.replace(/<script(\s[^>]*)?>/gi, (match) =>
    match.includes('nonce=') ? match : match.replace('<script', `<script nonce="${nonce}"`)
  );
  out = out.replace(/<style(\s[^>]*)?>/gi, (match) =>
    match.includes('nonce=') ? match : match.replace('<style', `<style nonce="${nonce}"`)
  );
  return out;
}

/**
 * Stamps the HTML shell with the master's language/theme so the first paint
 * (and `window.__PKEY_BOOT_UI__`) match the vault before WebSocket auth.
 *
 * @param html - PWA HTML (already CSP-nonced when applicable)
 * @param boot - Language + theme from the live vault
 * @param nonce - CSP nonce for the boot script (omit when CSP is not used)
 */
export function injectPwaBootUi(html: string, boot: PwaBootUi, nonce?: string): string {
  const htmlLang = htmlLangAttr(boot.language);
  const dataTheme = boot.theme === 'LIGHT' ? 'light' : 'dark';
  let out = html.replace(/<html\b([^>]*)>/i, (_match, attrs: string) => {
    const cleaned = String(attrs)
      .replace(/\slang="[^"]*"/i, '')
      .replace(/\sdata-theme="[^"]*"/i, '');
    return `<html${cleaned} lang="${htmlLang}" data-theme="${dataTheme}">`;
  });
  const payload = JSON.stringify({
    language: boot.language,
    theme: boot.theme,
    ...(boot.webLoginOnPhone === true ? { webLoginOnPhone: true } : {}),
  });
  const nonceAttr = nonce ? ` nonce="${nonce}"` : '';
  const script = `<script${nonceAttr}>window.__PKEY_BOOT_UI__=${payload};</script>`;
  out = out.replace(/<head\b[^>]*>/i, (head) => `${head}${script}`);
  return out;
}

/**
 * Returns the embedded web vault HTML, optionally nonced for CSP and stamped
 * with the master's language/theme for pre-auth chrome.
 *
 * @param port - Local web-access listen port
 * @param host - Bind host used when injecting CSP (default loopback)
 * @param nonce - When set, rewrites inline tags with this nonce
 * @param bootUi - Optional vault language/theme for first paint
 */
export function getPwaHtml(
  port: number,
  host = '127.0.0.1',
  nonce?: string,
  bootUi?: PwaBootUi
): string {
  const shell = loadEmbeddedHtml();
  let html = nonce ? injectPwaCsp(shell, host, port, nonce) : shell;
  if (bootUi) html = injectPwaBootUi(html, bootUi, nonce);
  return html;
}

/**
 * Looks up an allowlisted PWA static asset (icons, favicon, manifest).
 * Unknown paths and any `..` / non-root keys return `null`.
 *
 * @param requestPath - HTTP path from the request line (query string ignored)
 */
export function getPwaAsset(requestPath: string): PwaStaticAsset | null {
  const raw = (requestPath || '').split('?')[0] || '';
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!decoded.startsWith('/') || decoded.includes('..') || decoded.includes('//')) {
    return null;
  }
  const entry = loadEmbeddedAssets()[decoded];
  if (!entry) return null;
  return { mime: entry.mime, body: Buffer.from(entry.body, 'base64') };
}
