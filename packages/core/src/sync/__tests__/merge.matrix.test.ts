/**
 * @fileoverview Table-driven merge coverage for every PasswordCard field.
 */
import { describe, it, expect } from 'vitest';
import { mergeCardFields, mergeCards, mergePullLocally } from '../merge';
import { makeCard, makeNote, makeSeed, ts } from './peerVault';
import type { PasswordCard } from '../../types/index';

const older = (extra: Partial<PasswordCard> = {}): PasswordCard =>
  makeCard({ last_update: ts(1), creation_date: ts(0), ...extra });
const newer = (extra: Partial<PasswordCard> = {}): PasswordCard =>
  makeCard({ last_update: ts(2), creation_date: ts(0), ...extra });

describe('merge.matrix fill-empty (no overwrite)', () => {
  const cases: { field: string; older: Partial<PasswordCard>; newer: Partial<PasswordCard> }[] = [
    { field: 'title', older: { title: 'Kept' }, newer: { title: '' } },
    { field: 'username', older: { username: 'alice' }, newer: { username: '' } },
    { field: 'link', older: { link: 'https://a.test' }, newer: { link: '' } },
    { field: 'notes', older: { notes: 'n' }, newer: { notes: '' } },
    { field: 'password', older: { passwordList: ['secret'] }, newer: { passwordList: [''] } },
    { field: 'otpSecret', older: { otpSecret: 'JBSWY3DPEHPK3PXP' }, newer: { otpSecret: '' } },
    { field: 'tags', older: { tags: ['work'] }, newer: { tags: [] } },
  ];

  it.each(cases)('keeps older $field when newer is empty', ({ field, older: o, newer: n }) => {
    const { card, overwrittenFields } = mergeCardFields(older(o), newer(n));
    expect(overwrittenFields).not.toContain(field === 'password' ? 'password' : field);
    if (field === 'title') expect(card.title).toBe('Kept');
    if (field === 'username') expect(card.username).toBe('alice');
    if (field === 'link') expect(card.link).toBe('https://a.test');
    if (field === 'notes') expect(card.notes).toBe('n');
    if (field === 'password') expect(card.passwordList).toEqual(['secret']);
    if (field === 'otpSecret') expect(card.otpSecret).toBe('JBSWY3DPEHPK3PXP');
    if (field === 'tags') expect(card.tags).toEqual(['work']);
  });
});

describe('merge.matrix LWW when timestamps differ (no overwrite notice)', () => {
  it.each([
    ['title', { title: 'Old' }, { title: 'New' }, 'New'],
    ['username', { username: 'a' }, { username: 'b' }, 'b'],
    ['link', { link: 'https://a.test' }, { link: 'https://b.test' }, 'https://b.test'],
    ['notes', { notes: 'a' }, { notes: 'b' }, 'b'],
  ] as const)('%s keeps newer without overwrite', (field, o, n, expected) => {
    const { card, overwrittenFields } = mergeCardFields(older({ ...o }), newer({ ...n }));
    expect(overwrittenFields).not.toContain(field);
    expect(card[field]).toBe(expected);
  });

  it('password LWW keeps newer without overwrite', () => {
    const { card, overwrittenFields } = mergeCardFields(
      older({ passwordList: ['oldpw'] }),
      newer({ passwordList: ['newpw'] })
    );
    expect(overwrittenFields).not.toContain('password');
    expect(card.passwordList).toEqual(['newpw']);
  });

  it('otpSecret LWW keeps newer without overwrite', () => {
    const { card, overwrittenFields } = mergeCardFields(
      older({ otpSecret: 'OLDSECRETBASE32AAA' }),
      newer({ otpSecret: 'NEWSECRETBASE32AAA' })
    );
    expect(overwrittenFields).not.toContain('otpSecret');
    expect(card.otpSecret).toBe('NEWSECRETBASE32AAA');
  });

  it('icon LWW keeps newer without overwrite', () => {
    const { card, overwrittenFields } = mergeCardFields(
      older({ icon: { type: 'icon', value: 'logo-github' } }),
      newer({ icon: { type: 'icon', value: 'logo-gitlab' } })
    );
    expect(overwrittenFields).not.toContain('icon');
    expect(card.icon).toEqual({ type: 'icon', value: 'logo-gitlab' });
  });

  it('tag union does not report overwrite', () => {
    const { overwrittenFields } = mergeCardFields(older({ tags: ['a'] }), newer({ tags: ['b'] }));
    expect(overwrittenFields).not.toContain('tags');
  });
});

describe('merge.matrix overwrite only on timestamp tie', () => {
  const t = ts(9);
  it.each([
    ['title', { title: 'Old' }, { title: 'New' }, 'New'],
    ['username', { username: 'a' }, { username: 'b' }, 'b'],
    ['link', { link: 'https://a.test' }, { link: 'https://b.test' }, 'https://b.test'],
    ['notes', { notes: 'a' }, { notes: 'b' }, 'b'],
  ] as const)('%s reports overwrite on a tie', (field, o, n, expected) => {
    const { card, overwrittenFields } = mergeCardFields(
      makeCard({ last_update: t, ...o }),
      makeCard({ last_update: t, ...n })
    );
    expect(overwrittenFields).toContain(field);
    expect(card[field]).toBe(expected);
  });

  it('password conflict reports overwrite on a tie', () => {
    const { card, overwrittenFields } = mergeCardFields(
      makeCard({ last_update: t, passwordList: ['oldpw'] }),
      makeCard({ last_update: t, passwordList: ['newpw'] })
    );
    expect(overwrittenFields).toContain('password');
    expect(card.passwordList).toEqual(['newpw']);
  });

  it('otpSecret conflict reports overwrite on a tie', () => {
    const { card, overwrittenFields } = mergeCardFields(
      makeCard({ last_update: t, otpSecret: 'OLDSECRETBASE32AAA' }),
      makeCard({ last_update: t, otpSecret: 'NEWSECRETBASE32AAA' })
    );
    expect(overwrittenFields).toContain('otpSecret');
    expect(card.otpSecret).toBe('NEWSECRETBASE32AAA');
  });

  it('icon conflict reports overwrite on a tie', () => {
    const { card, overwrittenFields } = mergeCardFields(
      makeCard({ last_update: t, icon: { type: 'icon', value: 'logo-github' } }),
      makeCard({ last_update: t, icon: { type: 'icon', value: 'logo-gitlab' } })
    );
    expect(overwrittenFields).toContain('icon');
    expect(card.icon).toEqual({ type: 'icon', value: 'logo-gitlab' });
  });
});

describe('merge.matrix timestamp ties', () => {
  const t = ts(5);
  it('mergeCards prefers incoming remote on equal last_update', () => {
    const local = makeCard({ title: 'mobile', last_update: t });
    const remote = makeCard({ title: 'pwa', last_update: t });
    expect(mergeCards([local], [remote]).cards[0].title).toBe('pwa');
  });

  it('mergePullLocally prefers local on equal last_update', () => {
    const local = makeCard({ title: 'pwa-just-saved', last_update: t });
    const remote = makeCard({ title: 'stale-echo', last_update: t });
    const { cards } = mergePullLocally([local], { upserts: [remote] });
    expect(cards[0].title).toBe('pwa-just-saved');
  });
});

describe('merge.matrix card types', () => {
  it.each([
    ['PASSWORD', makeCard({ id: 'p', last_update: ts(2) })],
    ['NOTE', makeNote({ last_update: ts(2) })],
    ['SECRET_PHRASE', makeSeed({ last_update: ts(2) })],
  ] as const)('creates a new %s card from remote-only upsert', (_type, remote) => {
    const { cards } = mergeCards([], [remote]);
    expect(cards).toHaveLength(1);
    expect(cards[0].type).toBe(_type);
    expect(cards[0].id).toBe(remote.id);
  });

  it('rejects NOTE takeover of a filled PASSWORD card', () => {
    const local = makeCard({ last_update: ts(1), passwordList: ['keep'] });
    const remote = makeNote({ id: 'card-1', last_update: ts(2), title: 'as-note' });
    const { cards } = mergeCards([local], [remote]);
    expect(cards[0].type).toBe('PASSWORD');
    expect(cards[0].passwordList).toEqual(['keep']);
    expect(cards[0].title).toBe('as-note');
  });

  it('rejects PASSWORD takeover of a filled SECRET_PHRASE card', () => {
    const local = makeSeed({ id: 'card-1', last_update: ts(1) });
    const remote = makeCard({
      id: 'card-1',
      last_update: ts(2),
      title: 'as-password',
      passwordList: ['not-a-seed'],
    });
    const { cards } = mergeCards([local], [remote]);
    expect(cards[0].type).toBe('SECRET_PHRASE');
    expect(cards[0].passwordList).toEqual(local.passwordList);
    expect(cards[0].title).toBe('as-password');
  });
});

describe('merge.matrix tombstones', () => {
  it('deletes when tombstone is newer than the card', () => {
    const card = makeCard({ last_update: ts(1) });
    const { cards, tombstones } = mergeCards(
      [card],
      [],
      [],
      [{ id: 'card-1', deletedAt: ts(2) }]
    );
    expect(cards).toHaveLength(0);
    expect(tombstones.some((t) => t.id === 'card-1')).toBe(true);
  });

  it('resurrects when the card is newer than the tombstone', () => {
    const card = makeCard({ last_update: ts(3), title: 'back' });
    const { cards, tombstones } = mergeCards(
      [],
      [card],
      [{ id: 'card-1', deletedAt: ts(1) }],
      []
    );
    expect(cards[0].title).toBe('back');
    expect(tombstones.some((t) => t.id === 'card-1')).toBe(false);
  });

  it('keeps the later deletedAt when both sides tombstone', () => {
    const { tombstones, cards } = mergeCards(
      [],
      [],
      [{ id: 'card-1', deletedAt: ts(1) }],
      [{ id: 'card-1', deletedAt: ts(4) }]
    );
    expect(cards).toHaveLength(0);
    expect(tombstones.find((t) => t.id === 'card-1')?.deletedAt).toBe(ts(4));
  });

  it('mergePullLocally applies a tombstone at or after last_update', () => {
    const { cards } = mergePullLocally([makeCard({ last_update: ts(1) })], {
      tombstones: [{ id: 'card-1', deletedAt: ts(1) }],
    });
    expect(cards).toHaveLength(0);
  });

  it('mergePullLocally ignores a stale tombstone', () => {
    const { cards } = mergePullLocally([makeCard({ last_update: ts(5) })], {
      tombstones: [{ id: 'card-1', deletedAt: ts(1) }],
    });
    expect(cards).toHaveLength(1);
  });
});

describe('merge.matrix identical values', () => {
  it.each([
    ['title', { title: 'Same' }],
    ['username', { username: 'same@x.test' }],
    ['link', { link: 'https://same.test' }],
    ['notes', { notes: 'same' }],
    ['passwordList', { passwordList: ['samepw'] }],
    ['otpSecret', { otpSecret: 'JBSWY3DPEHPK3PXP' }],
    ['tags', { tags: ['same'] }],
    ['icon', { icon: { type: 'icon' as const, value: 'logo-github' } }],
  ] as const)('no overwrite when %s matches', (_field, extra) => {
    const { overwrittenFields } = mergeCardFields(older({ ...extra }), newer({ ...extra }));
    expect(overwrittenFields).toEqual([]);
  });
});

describe('merge.matrix hibp / otp params', () => {
  it('keeps newer hibp payload', () => {
    const { cards } = mergeCards(
      [
        makeCard({
          last_update: ts(1),
          hibp: { status: 'clean', checkedAt: ts(0), pwHash: 'a'.repeat(64) },
        }),
      ],
      [
        makeCard({
          last_update: ts(2),
          hibp: { status: 'breached', count: 3, checkedAt: ts(2), pwHash: 'b'.repeat(64) },
        }),
      ]
    );
    expect(cards[0].hibp).toMatchObject({ status: 'breached', count: 3 });
  });

  it('fills otp algorithm/digits/period from the side that has them', () => {
    const { card } = mergeCardFields(
      older({ otpAlgorithm: 'SHA256', otpDigits: 8, otpPeriod: 60, otpSecret: 'AA' }),
      newer({ otpSecret: 'AA' })
    );
    expect(card.otpAlgorithm).toBe('SHA256');
    expect(card.otpDigits).toBe(8);
    expect(card.otpPeriod).toBe(60);
  });
});
