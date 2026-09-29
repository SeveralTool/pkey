/**
 * @fileoverview Post-lock session snapshot must not retain fixture passwords (H1).
 */
import { createEmptySessionDatabase } from './emptySessionDatabase';

const FIXTURE = 'fixture-password-should-not-survive-lock';

describe('createEmptySessionDatabase (H1)', () => {
  it('serializes without leftover card secrets', () => {
    const empty = createEmptySessionDatabase();
    expect(empty.cards).toEqual([]);
    expect(empty.passwordHash).toBe('');
    expect(JSON.stringify(empty)).not.toContain(FIXTURE);
  });
});
