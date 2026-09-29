/**
 * @fileoverview Group vault cards by normalized host (Bitwarden-style host match).
 *
 * Keying ignores scheme, `www.`, path, query, and fragment. Non-default ports are
 * part of the key. Android app packages use a separate `pkg:` namespace. Empty or
 * unparseable links never group. Derived package→host mappings are **not** used
 * (app-only Instagram does not group with instagram.com).
 */
import { collectIdentities, explicitHostPortsOf, androidPackagesOf } from './identities';

/** List row after optional group-by-link transform. */
export type CardLinkListRow<T> =
  | { kind: 'single'; card: T }
  | { kind: 'group'; key: string; label: string; cards: T[] };

/**
 * Stable group key for a card link, or `null` when the card must stay a singleton.
 * Keys are prefixed: `host:…` or `pkg:…`.
 */
export function linkGroupKey(link: string, uris?: readonly string[] | null): string | null {
  const ids = collectIdentities(link, uris);
  const hosts = explicitHostPortsOf(ids);
  if (hosts[0]) return `host:${hosts[0]}`;
  const pkgs = androidPackagesOf(ids);
  if (pkgs[0]) return `pkg:${pkgs[0]}`;
  return null;
}

/** Human-readable label for a {@link linkGroupKey} result. */
export function linkGroupLabel(key: string): string {
  if (key.startsWith('host:')) return key.slice('host:'.length);
  if (key.startsWith('pkg:')) return key.slice('pkg:'.length);
  return key;
}

type Groupable = {
  id: string;
  link: string;
  uris?: string[];
  title?: string;
  username?: string;
};

function compareMembers<T extends Groupable>(a: T, b: T): number {
  const titleCmp = (a.title || '').localeCompare(b.title || '');
  if (titleCmp !== 0) return titleCmp;
  return (a.username || '').localeCompare(b.username || '');
}

/**
 * Transforms a filtered card list into singles and multi-card host groups.
 * Preserves first-seen group order; sorts members by title then username.
 * Cards with no group key always remain singles.
 */
export function groupCardsByLinkKey<T extends Groupable>(cards: T[]): CardLinkListRow<T>[] {
  const buckets = new Map<string, T[]>();
  const singles: { index: number; card: T }[] = [];

  cards.forEach((card, index) => {
    const key = linkGroupKey(card.link || '', card.uris);
    if (!key) {
      singles.push({ index, card });
      return;
    }
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(card);
  });

  const emittedKeys = new Set<string>();
  const rows: CardLinkListRow<T>[] = [];
  const singletonByIndex = new Map(singles.map((s) => [s.index, s.card]));

  cards.forEach((card, index) => {
    if (singletonByIndex.has(index)) {
      rows.push({ kind: 'single', card });
      return;
    }
    const key = linkGroupKey(card.link || '', card.uris);
    if (!key || emittedKeys.has(key)) return;
    emittedKeys.add(key);
    const members = [...(buckets.get(key) || [])].sort(compareMembers);
    if (members.length <= 1) {
      rows.push({ kind: 'single', card: members[0] ?? card });
      return;
    }
    rows.push({
      kind: 'group',
      key,
      label: linkGroupLabel(key),
      cards: members,
    });
  });

  return rows;
}
