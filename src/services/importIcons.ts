/**
 * @fileoverview Icon enrichment helpers for bulk card imports.
 */
import type { PasswordCard } from '../types';
import { detectIcon } from './iconDetection';

/** Progress callback: `current` completed of `total` cards. */
export type ImportIconProgress = (current: number, total: number) => void;

const ICON_IMPORT_CONCURRENCY = 6;

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  const runWorker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index]!, index);
    }
  };
  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, runWorker));
}

/**
 * Resolves favicons / preset icons for imported cards (same logic as save-with-detection).
 *
 * @param cards - Cards to enrich.
 * @param onProgress - Optional progress callback.
 * @param options.allowRemoteFavicon - When true, allow remote favicon fetches
 *        (leaks domains to third-party providers). Off by default; caller must
 *        thread `db.settings.enableFaviconLookup` through. Audit finding M5.
 */
export async function enrichImportedCardsWithIcons(
  cards: PasswordCard[],
  onProgress?: ImportIconProgress,
  options: { allowRemoteFavicon?: boolean } = {}
): Promise<PasswordCard[]> {
  const total = cards.length;
  const enriched: PasswordCard[] = new Array(total);
  let completed = 0;
  const allowRemoteFavicon = options.allowRemoteFavicon === true;

  await mapWithConcurrency(cards, ICON_IMPORT_CONCURRENCY, async (card, index) => {
    try {
      const { icon } = await detectIcon(card.title, card.link, { allowRemoteFavicon });
      enriched[index] = { ...card, icon };
    } catch {
      enriched[index] = { ...card, icon: card.icon };
    } finally {
      completed += 1;
      onProgress?.(completed, total);
    }
  });

  return enriched;
}
