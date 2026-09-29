/**
 * @fileoverview Domain / package ranking for login autofill candidates.
 */

import type { PasswordCard } from '../types';
import { collectIdentities, hostsOf, androidPackagesOf, iosAppIdsOf } from './identities';
import { parseLinkIdentity } from './parse';

export interface LoginMatchCandidate {
  card: PasswordCard;
  score: number;
  reason: 'exact-host' | 'registrable' | 'substring' | 'package' | 'title';
}

function stripWww(host: string): string {
  return host.replace(/^www\./i, '').toLowerCase();
}

/**
 * Hostname from a URL-like string (no package schemes). Empty when not a web host.
 */
export function hostFromLink(link: string): string {
  const id = parseLinkIdentity(link || '');
  if (!id || id.kind === 'blocked' || id.kind === 'ignored') return '';
  if (id.kind === 'web') return id.host ?? '';
  // Do not treat android packages as hosts.
  return '';
}

/**
 * Rough eTLD+1-ish registrable domain (last two labels). Good enough for
 * matching `mail.google.com` ↔ `google.com` without a PSL dependency.
 */
export function registrableDomain(host: string): string {
  const h = stripWww(host.trim());
  if (!h || !h.includes('.')) return h;
  const parts = h.split('.').filter(Boolean);
  if (parts.length <= 2) return h;
  return parts.slice(-2).join('.');
}

function queryHost(urlOrHost: string): string {
  const id = parseLinkIdentity(urlOrHost);
  if (id?.kind === 'web' && id.host) return id.host;
  const fallback = parseLinkIdentity(
    /^https?:\/\//i.test(urlOrHost) ? urlOrHost : `https://${urlOrHost}`
  );
  return fallback?.kind === 'web' ? (fallback.host ?? '') : '';
}

/**
 * Ranks vault cards for a browser URL or Android/iOS package name.
 * Matching uses `link` **and** `uris`.
 */
export function matchLoginCandidates(
  cards: PasswordCard[],
  opts: { urlOrHost?: string; packageName?: string; iosAppId?: string; limit?: number }
): LoginMatchCandidate[] {
  const limit = opts.limit ?? 8;
  const host = queryHost(opts.urlOrHost || '');
  const reg = host ? registrableDomain(host) : '';
  const pkg = (opts.packageName || '').trim().toLowerCase();
  const ios = (opts.iosAppId || '').trim().toLowerCase();
  const out: LoginMatchCandidate[] = [];

  for (const card of cards) {
    if (!card?.id || card.type === 'SECRET_PHRASE' || card.type === 'NOTE') continue;
    const ids = collectIdentities(card.link || '', card.uris);
    const cardHosts = hostsOf(ids);
    const cardPkgs = androidPackagesOf(ids);
    const cardIos = iosAppIdsOf(ids);

    let score = 0;
    let reason: LoginMatchCandidate['reason'] = 'title';

    if (pkg && cardPkgs.includes(pkg)) {
      score = 100;
      reason = 'package';
    } else if (ios && cardIos.includes(ios)) {
      score = 100;
      reason = 'package';
    } else if (host && cardHosts.includes(host)) {
      score = 90;
      reason = 'exact-host';
    } else if (reg && cardHosts.some((h) => registrableDomain(h) === reg)) {
      score = 70;
      reason = 'registrable';
    } else if (
      host &&
      cardHosts.some((h) => host.endsWith(`.${h}`) || h.endsWith(`.${host}`))
    ) {
      score = 55;
      reason = 'substring';
    } else if (host && (card.title || '').toLowerCase().includes(host.split('.')[0] || host)) {
      score = 25;
      reason = 'title';
    } else if (
      pkg &&
      ((card.title || '').toLowerCase().includes(pkg.split('.').pop() || pkg) ||
        (card.link || '').toLowerCase().includes(pkg) ||
        (card.uris ?? []).some((u) => u.toLowerCase().includes(pkg)))
    ) {
      score = 20;
      reason = 'title';
    }

    if (score > 0) out.push({ card, score, reason });
  }

  out.sort((a, b) => b.score - a.score || a.card.title.localeCompare(b.card.title));
  return out.slice(0, limit);
}
