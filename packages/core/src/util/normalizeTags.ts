/**
 * @fileoverview Tag normalization for stable storage and fingerprint hashing.
 */

/**
 * Normalizes tag arrays for stable storage and fingerprint hashing.
 * Trims, lowercases, dedupes, and sorts.
 *
 * @param tags - Raw tag list (may be undefined).
 * @returns Sorted unique lowercase tags, or `[]` when empty/undefined.
 */
export function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags?.length) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
  }
  return result.sort();
}
