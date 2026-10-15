import { describe, expect, it } from 'vitest';
import {
  LISTING_DEMO_TAG,
  buildListingDemoCards,
  canReplaceWithListingDemo,
  exportListingDemoCsv,
  listingDemoDrafts,
  listingDemoSequentialId,
} from './listing-demo';

describe('listing demo catalog', () => {
  it('tags every card demo and includes the requested brands', () => {
    let n = 0;
    const cards = buildListingDemoCards({
      now: new Date('2026-09-29T12:00:00.000Z'),
      nextId: () => listingDemoSequentialId(n++),
    });
    const titles = cards.map((c) => c.title);
    expect(titles).toEqual([
      'Instagram',
      'Google',
      'Google',
      'Google',
      'Banco',
      'TikTok',
      'Cursor',
      'Twitch',
      'GitHub',
      'Discord',
    ]);
    expect(cards.length).toBe(listingDemoDrafts().length);
    expect(cards.length).toBe(10);
    expect(cards.filter((c) => c.title === 'Google').map((c) => c.username)).toEqual([
      'pkey.demo@example.com',
      'pkey.trabajo@example.com',
      'pkey.alt@example.com',
    ]);
    expect(new Set(cards.filter((c) => c.title === 'Google').map((c) => c.link)).size).toBe(1);
    expect(cards.every((c) => c.tags?.includes(LISTING_DEMO_TAG))).toBe(true);
    expect(cards.every((c) => c.type === 'PASSWORD')).toBe(true);
    expect(cards.some((c) => c.otpSecret)).toBe(true);
  });

  it('refuses a vault that still has non-demo cards', () => {
    expect(canReplaceWithListingDemo([])).toBe(true);
    expect(canReplaceWithListingDemo([{ tags: ['demo'] }])).toBe(true);
    expect(canReplaceWithListingDemo([{ tags: ['demo', 'social'] }])).toBe(true);
    expect(canReplaceWithListingDemo([{ tags: ['trabajo'] }])).toBe(false);
    expect(canReplaceWithListingDemo([{ tags: ['demo'] }, { tags: [] }])).toBe(false);
  });

  it('exports a stable CSV with the demo tag', () => {
    const csv = exportListingDemoCsv();
    expect(csv).toContain('title,type,username,password,link,notes,otpSecret,tags');
    expect(csv).toContain('Instagram');
    expect(csv).toContain('Cursor');
    expect(csv).toContain(LISTING_DEMO_TAG);
    expect(csv).toBe(exportListingDemoCsv());
  });
});
