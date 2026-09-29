/**
 * @fileoverview Canonical `link` for UI + leftover `uris` for OS identities.
 */

import { CARD_LINK_MAX, CARD_URIS_MAX, clampField } from '../constants/fieldLimits';
import { collectIdentities, uniqueIdentities } from './identities';
import { parseLinkIdentity } from './parse';
import { packageToDisplayLabel } from './packageMeta';
import type { LinkIdentity } from './types';

function firstExplicitHttps(ids: readonly LinkIdentity[]): string | null {
  for (const id of ids) {
    if (id.kind === 'web' && id.host) return id.canonical;
    if (id.browserFallbackUrl && /^https?:\/\//i.test(id.browserFallbackUrl)) {
      const parsed = parseLinkIdentity(id.browserFallbackUrl);
      if (parsed?.kind === 'web') return parsed.canonical;
    }
    if (id.kind === 'android_package' && id.host && !id.derived) {
      return `https://${id.host}`;
    }
  }
  return null;
}

function firstDerivedHttps(ids: readonly LinkIdentity[]): string | null {
  for (const id of ids) {
    if (id.host && id.derived) return `https://${id.host}`;
  }
  return null;
}

function firstAndroidApp(ids: readonly LinkIdentity[]): string | null {
  for (const id of ids) {
    if (id.androidPackage) return `android-app://${id.androidPackage}`;
  }
  return null;
}

function firstIosApp(ids: readonly LinkIdentity[]): string | null {
  for (const id of ids) {
    if (id.iosAppId) return `iosapp://${id.iosAppId}`;
  }
  return null;
}

/**
 * Picks the human-visible canonical URL.
 * Order: explicit https → derived https from package map → android-app:// → iosapp:// → first original.
 */
export function pickCanonicalLink(ids: readonly LinkIdentity[]): string {
  return (
    firstExplicitHttps(ids) ||
    firstDerivedHttps(ids) ||
    firstAndroidApp(ids) ||
    firstIosApp(ids) ||
    ids[0]?.canonical.trim() ||
    ''
  );
}

/** Label for lists: brand name, host, or package. */
export function displayLabel(ids: readonly LinkIdentity[], fallback = ''): string {
  for (const id of ids) {
    if (id.androidPackage) return packageToDisplayLabel(id.androidPackage);
    if (id.iosAppId) return id.iosAppId;
  }
  const canon = pickCanonicalLink(ids);
  if (canon.startsWith('https://')) return canon.replace(/^https:\/\//, '');
  return fallback || canon;
}

export function displayUrl(ids: readonly LinkIdentity[], fallback = ''): string {
  const canon = pickCanonicalLink(ids);
  return canon || fallback;
}

export interface CardLinkFields {
  link: string;
  uris?: string[];
}

/**
 * Builds stored `link` + extra `uris` from one or more raw import/export URIs.
 */
export function buildCardLinkFields(rawUris: readonly string[]): CardLinkFields {
  const originals: string[] = [];
  const seenOrig = new Set<string>();
  for (const raw of rawUris) {
    const { value } = clampField(raw ?? '', CARD_LINK_MAX);
    if (!value || seenOrig.has(value)) continue;
    const parsed = parseLinkIdentity(value);
    if (!parsed || parsed.kind === 'blocked' || parsed.kind === 'ignored') continue;
    seenOrig.add(value);
    originals.push(value);
  }

  const ids = uniqueIdentities(collectIdentities(originals[0] ?? '', originals.slice(1)));
  const link = pickCanonicalLink(ids);
  if (!link) return { link: '' };

  const extras: string[] = [];
  const seenExtra = new Set<string>([link]);
  for (const orig of originals) {
    if (extras.length >= CARD_URIS_MAX) break;
    if (seenExtra.has(orig)) continue;
    seenExtra.add(orig);
    extras.push(orig);
  }
  return extras.length ? { link, uris: extras } : { link };
}

/**
 * Keeps extra `uris` when the user edits the visible `link` field.
 */
export function preserveUrisOnLinkEdit(
  previous: { link: string; uris?: string[] } | undefined,
  nextLink: string
): CardLinkFields {
  const trimmed = nextLink.trim();
  if (previous && trimmed === (previous.link ?? '').trim()) {
    return {
      link: previous.link,
      ...(previous.uris?.length ? { uris: previous.uris } : {}),
    };
  }
  const raw = [trimmed, previous?.link ?? '', ...(previous?.uris ?? [])];
  return buildCardLinkFields(raw);
}
