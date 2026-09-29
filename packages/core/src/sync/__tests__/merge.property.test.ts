/**
 * @fileoverview Seeded property tests: merge is commutative when timestamps differ
 * and never drops a secret present on either side.
 */
import { describe, it, expect } from 'vitest';
import { mergeCardFields } from '../merge';
import { makeCard, ts } from './peerVault';
import type { PasswordCard } from '../../types/index';

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

function randomCard(rng: () => number, lastUpdate: string): PasswordCard {
  const hasPw = rng() > 0.2;
  const hasOtp = rng() > 0.6;
  const tagPool = ['work', 'personal', 'bank', 'dev', ''];
  const tags = [pick(rng, tagPool), pick(rng, tagPool)].filter(Boolean);
  return makeCard({
    last_update: lastUpdate,
    title: pick(rng, ['Alpha', 'Beta', 'Gamma', '']),
    username: pick(rng, ['a@x.test', 'b@y.test', '']),
    passwordList: hasPw ? [pick(rng, ['s1', 's2', 's3'])] : [''],
    notes: pick(rng, ['', 'n1', 'n2']),
    link: pick(rng, ['', 'https://a.test', 'https://b.test']),
    tags,
    otpSecret: hasOtp ? pick(rng, ['JBSWY3DPEHPK3PXP', 'GEZDGNBVGY3TQOJQ']) : '',
  });
}

function hasSecret(c: PasswordCard): boolean {
  return !!(c.passwordList?.[0] || '').trim() || !!(c.otpSecret || '').trim();
}

describe('merge.property', () => {
  const seeds = Array.from({ length: 50 }, (_, i) => i + 1);

  it.each(seeds)('seed %s: commutative when timestamps differ; secrets preserved', (seed) => {
    const rng = mulberry32(seed * 997);
    const a = randomCard(rng, ts(1));
    const b = randomCard(rng, ts(2));
    const ab = mergeCardFields(a, b).card;
    const ba = mergeCardFields(b, a).card;
    expect(ab.title).toBe(ba.title);
    expect(ab.username).toBe(ba.username);
    expect(ab.passwordList).toEqual(ba.passwordList);
    expect(ab.notes).toBe(ba.notes);
    expect(ab.link).toBe(ba.link);
    expect(ab.otpSecret || '').toBe(ba.otpSecret || '');
    expect([...(ab.tags ?? [])].sort()).toEqual([...(ba.tags ?? [])].sort());
    if (hasSecret(a) || hasSecret(b)) {
      expect(hasSecret(ab)).toBe(true);
    }
  });
});
