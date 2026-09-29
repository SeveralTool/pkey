/**
 * @fileoverview Collect match identities from `link` + extra `uris`.
 */

import { CARD_LINK_MAX, CARD_URIS_MAX, clampField } from '../constants/fieldLimits';
import { parseLinkIdentity } from './parse';
import type { LinkIdentity } from './types';

function usable(id: LinkIdentity | null): id is LinkIdentity {
  return !!id && id.kind !== 'blocked' && id.kind !== 'ignored';
}

/**
 * Parses `link` and optional extra URIs into identities (order preserved, duplicates kept
 * until {@link uniqueIdentities}).
 */
export function collectIdentities(link: string, uris?: readonly string[] | null): LinkIdentity[] {
  const raw = [link, ...(uris ?? [])];
  const out: LinkIdentity[] = [];
  for (const item of raw) {
    const id = parseLinkIdentity(item || '');
    if (usable(id)) out.push(id);
  }
  return out;
}

/** Dedupes by kind + canonical key (package / hostPort / ios id). */
export function uniqueIdentities(ids: readonly LinkIdentity[]): LinkIdentity[] {
  const seen = new Set<string>();
  const out: LinkIdentity[] = [];
  for (const id of ids) {
    const key =
      id.kind === 'android_package'
        ? `pkg:${id.androidPackage}`
        : id.kind === 'ios_app'
          ? `ios:${id.iosAppId}`
          : id.kind === 'web'
            ? `host:${id.hostPort || id.host}`
            : `orig:${id.original}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
}

export function androidPackagesOf(ids: readonly LinkIdentity[]): string[] {
  return [...new Set(ids.map((i) => i.androidPackage).filter((p): p is string => !!p))];
}

export function iosAppIdsOf(ids: readonly LinkIdentity[]): string[] {
  return [...new Set(ids.map((i) => i.iosAppId).filter((p): p is string => !!p))];
}

/** Hosts for autofill match (includes derived package→host). */
export function hostsOf(ids: readonly LinkIdentity[]): string[] {
  return [...new Set(ids.map((i) => i.host).filter((h): h is string => !!h))];
}

/** Host+port keys from URIs that actually contain a web host (not package-derived). */
export function explicitHostPortsOf(ids: readonly LinkIdentity[]): string[] {
  return [
    ...new Set(
      ids
        .filter((i) => i.kind === 'web' || (i.hostPort && !i.derived))
        .map((i) => i.hostPort)
        .filter((h): h is string => !!h)
    ),
  ];
}

/**
 * Clamps and caps extra URIs for storage.
 */
export function clampUris(uris: readonly string[] | undefined | null): string[] | undefined {
  if (!uris?.length) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of uris) {
    if (out.length >= CARD_URIS_MAX) break;
    const { value } = clampField(raw, CARD_LINK_MAX);
    if (!value || seen.has(value)) continue;
    const parsed = parseLinkIdentity(value);
    if (!parsed || parsed.kind === 'blocked' || parsed.kind === 'ignored') continue;
    seen.add(value);
    out.push(value);
  }
  return out.length ? out : undefined;
}
