import type { PasswordCard } from '../types';
import { enrichImportedCardsWithIcons } from './importIcons';

jest.mock('./iconDetection', () => ({
  detectIcon: jest.fn(async (title: string) => {
    await new Promise((r) => setTimeout(r, 20));
    return { icon: { type: 'icon', value: title } };
  }),
  faviconIconFromLink: jest.fn(() => null),
}));

const makeCard = (i: number): PasswordCard => ({
  id: `id-${i}`,
  type: 'PASSWORD',
  title: `Site ${i}`,
  icon: { type: 'icon', value: 'key-outline' },
  username: '',
  passwordList: [''],
  link: `https://example${i}.com`,
  notes: '',
  creation_date: '2026-01-01',
  last_update: '2026-01-01',
});

describe('enrichImportedCardsWithIcons', () => {
  it('preserves card order', async () => {
    const cards = [makeCard(0), makeCard(1), makeCard(2)];
    const result = await enrichImportedCardsWithIcons(cards);
    expect(result.map((c) => c.title)).toEqual(['Site 0', 'Site 1', 'Site 2']);
  });

  it('reports progress for each card', async () => {
    const progress: number[] = [];
    await enrichImportedCardsWithIcons([makeCard(0), makeCard(1)], (current) => {
      progress.push(current);
    });
    expect(progress).toEqual([1, 2]);
  });

  it('completes 12 cards faster than serial would (parallel batches)', async () => {
    const cards = Array.from({ length: 12 }, (_, i) => makeCard(i));
    const start = performance.now();
    await enrichImportedCardsWithIcons(cards);
    const elapsed = performance.now() - start;
    // Serial would be ~240ms (12×20ms); parallel should finish well under that.
    expect(elapsed).toBeLessThan(200);
  });
});
