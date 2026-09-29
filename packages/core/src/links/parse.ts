/**
 * @fileoverview Parse a single URI into a {@link LinkIdentity}.
 */

import { classifyScheme, extractScheme, isExplicitScheme } from './schemes';
import {
  normalizeIosAppId,
  normalizePackage,
  packageToWebHost,
} from './packageMeta';
import type { LinkIdentity } from './types';

/** Bare Android packages need ≥3 segments so `google.com` stays a host. */
const BARE_PACKAGE_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/i;

function stripWww(host: string): string {
  return host.replace(/^www\./i, '').toLowerCase();
}

function hostPortKey(hostname: string, port: string): string {
  const host = stripWww(hostname);
  if (port && port !== '80' && port !== '443') return `${host}:${port}`;
  return host;
}

function webIdentity(
  original: string,
  hostname: string,
  port: string,
  derived: boolean
): LinkIdentity {
  const host = stripWww(hostname);
  const hostPort = hostPortKey(hostname, port);
  return {
    kind: 'web',
    original,
    host,
    hostPort,
    canonical: `https://${host}`,
    derived,
  };
}

function parseWebUrl(trimmed: string): LinkIdentity | null {
  try {
    let candidate = trimmed;
    if (!isExplicitScheme(candidate)) {
      if (
        !candidate.includes('.') &&
        candidate !== 'localhost' &&
        !/^\d{1,3}(\.\d{1,3}){3}$/.test(candidate)
      ) {
        return null;
      }
      candidate = `https://${candidate}`;
    }
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname) return null;
    return webIdentity(trimmed, u.hostname, u.port, false);
  } catch {
    return null;
  }
}

function androidPackageIdentity(
  original: string,
  pkg: string,
  extra?: { host?: string; browserFallbackUrl?: string | null }
): LinkIdentity {
  const derivedHost = extra?.host ?? packageToWebHost(pkg) ?? undefined;
  return {
    kind: 'android_package',
    original,
    androidPackage: pkg,
    host: derivedHost,
    hostPort: derivedHost,
    canonical: `android-app://${pkg}`,
    derived: !extra?.host && !!derivedHost,
    browserFallbackUrl: extra?.browserFallbackUrl ?? null,
  };
}

function extractAndroidGooglePackage(link: string): string | null {
  const atMatch = link.match(/@([a-zA-Z_][a-zA-Z0-9_.]*)/i);
  if (atMatch?.[1]) return normalizePackage(atMatch[1]);
  const direct = link.match(/^android:\/\/([a-zA-Z_][a-zA-Z0-9_.]*)/i);
  return direct?.[1] ? normalizePackage(direct[1]) : null;
}

function extractMarketPackage(link: string): string | null {
  try {
    const url = new URL(link);
    if (url.protocol.toLowerCase() !== 'market:') return null;
    const id = url.searchParams.get('id');
    return id ? normalizePackage(id) : null;
  } catch {
    const idMatch = link.match(/[?&]id=([a-zA-Z_][a-zA-Z0-9_.]*)/i);
    return idMatch?.[1] ? normalizePackage(idMatch[1]) : null;
  }
}

function safeHttpUrl(raw: string): string | null {
  try {
    const decoded = decodeURIComponent(raw.trim());
    if (!/^https?:\/\//i.test(decoded)) return null;
    const url = new URL(decoded);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return decoded;
  } catch {
    return null;
  }
}

function extractIntentParts(link: string): {
  packageName: string | null;
  browserFallbackUrl: string | null;
} {
  const packageMatch = link.match(/;package=([a-zA-Z_][a-zA-Z0-9_.]*)(?:;|$)/i);
  const packageName = packageMatch?.[1] ? normalizePackage(packageMatch[1]) : null;
  const fallbackMatch = link.match(/;S\.browser_fallback_url=([^;]*)(?:;|$)/i);
  const browserFallbackUrl = fallbackMatch?.[1] ? safeHttpUrl(fallbackMatch[1]) : null;
  return { packageName, browserFallbackUrl };
}

/**
 * Bitwarden `androidapp://pkg` / Chrome `android-app://pkg[/https/host/path]`.
 */
function parseAndroidAppScheme(trimmed: string): LinkIdentity | null {
  const lower = trimmed.toLowerCase();
  const rest = lower
    .replace(/^android-app:\/\//, '')
    .replace(/^androidapp:\/\//, '');
  const [pkgPart, ...pathParts] = rest.split('/');
  const pkg = pkgPart ? normalizePackage(pkgPart.split('?')[0] ?? '') : null;
  if (!pkg) return null;

  let explicitHost: string | undefined;
  if (pathParts[0] === 'http' || pathParts[0] === 'https') {
    const host = pathParts[1];
    if (host) explicitHost = stripWww(host);
  }

  const fallback = explicitHost ? `https://${explicitHost}` : null;
  const id = androidPackageIdentity(trimmed, pkg, {
    host: explicitHost,
    browserFallbackUrl: fallback,
  });
  if (explicitHost) {
    id.derived = false;
    id.host = explicitHost;
    id.hostPort = explicitHost;
  }
  return id;
}

function parseIosApp(trimmed: string): LinkIdentity | null {
  const rest = trimmed.replace(/^(iosapp|apple-app):\/\//i, '').split('/')[0] ?? '';
  const id = normalizeIosAppId(rest.split('?')[0] ?? '');
  if (!id) return null;
  const host = packageToWebHost(id) ?? undefined;
  return {
    kind: 'ios_app',
    original: trimmed,
    iosAppId: id,
    host,
    hostPort: host,
    canonical: `iosapp://${id}`,
    derived: !!host,
  };
}

/**
 * Parses one vault URI. Returns null for empty / unparseable / ignored schemes.
 * Blocked schemes return a `blocked` identity so callers can reject them.
 */
export function parseLinkIdentity(raw: string): LinkIdentity | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;

  const cls = classifyScheme(trimmed);
  if (cls === 'blocked') {
    return { kind: 'blocked', original: trimmed, canonical: '' };
  }
  if (cls === 'ignored') {
    return { kind: 'ignored', original: trimmed, canonical: '' };
  }

  const scheme = extractScheme(trimmed);

  if (cls === 'android_app' || scheme === 'android-app' || scheme === 'androidapp') {
    if (scheme === 'android') {
      const pkg = extractAndroidGooglePackage(trimmed);
      return pkg ? androidPackageIdentity(trimmed, pkg) : null;
    }
    if (scheme === 'market') {
      const pkg = extractMarketPackage(trimmed);
      return pkg ? androidPackageIdentity(trimmed, pkg) : null;
    }
    if (scheme === 'intent') {
      const { packageName, browserFallbackUrl } = extractIntentParts(trimmed);
      if (!packageName) return null;
      let host: string | undefined;
      if (browserFallbackUrl) {
        try {
          host = stripWww(new URL(browserFallbackUrl).hostname);
        } catch {
          host = undefined;
        }
      }
      return androidPackageIdentity(trimmed, packageName, { host, browserFallbackUrl });
    }
    return parseAndroidAppScheme(trimmed);
  }

  if (cls === 'ios_app') {
    return parseIosApp(trimmed);
  }

  if (cls === 'web' || cls === 'none') {
    if (cls === 'none' && BARE_PACKAGE_RE.test(trimmed) && !trimmed.includes('://')) {
      const pkg = normalizePackage(trimmed);
      return pkg ? androidPackageIdentity(trimmed, pkg) : null;
    }
    return parseWebUrl(trimmed);
  }

  return null;
}

/** True when the string is a supported native-app URI with a valid package/bundle. */
export function isAppLink(raw: string): boolean {
  const id = parseLinkIdentity(raw);
  return id?.kind === 'android_package' || id?.kind === 'ios_app';
}
