import type { PasswordCard } from '../types';

function makeCard(i: number): PasswordCard {
  return {
    id: `card-${i}`,
    type: 'PASSWORD',
    title: `Card ${i}`,
    icon: { type: 'icon', value: 'key-outline' },
    username: `user${i}@example.com`,
    passwordList: [`password-${i}`],
    link: `https://example${i}.com`,
    notes: 'notes',
    creation_date: '2026-01-01T00:00:00.000Z',
    last_update: '2026-01-01T00:00:00.000Z',
  };
}

describe('storage serialization perf', () => {
  it('JSON.stringify of 1000 cards completes under 20ms', () => {
    const cards = Array.from({ length: 1000 }, (_, i) => makeCard(i));
    const db = {
      version: '1.0.0',
      creation_date: '2026-01-01',
      last_update: '2026-01-01',
      passwordHash: 'hash',
      settings: {},
      cards,
    };

    const start = performance.now();
    JSON.stringify(db);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(20);
  });
});
