/**
 * @fileoverview Live PWA↔master CRUD and reconnect-style flushes via PeerVault.
 */
import { describe, it, expect } from 'vitest';
import { createPeerVault, makeCard, makeNote, makeSeed, ts } from './peerVault';
import { normalizeTags } from '../../util/normalizeTags';

describe('peerVault.roundtrip', () => {
  it('tag-only PWA edit converges without overwrites', () => {
    const android = 'android://token@com.instagram.android/';
    const icon = { type: 'icon' as const, value: 'logo-instagram' };
    const base = makeCard({
      link: android,
      uris: [android],
      icon,
      tags: ['work'],
      last_update: ts(1),
    });
    const peer = createPeerVault([base]);
    peer.pwaEdit({
      ...base,
      tags: ['work', 'personal'],
      last_update: ts(2),
    });
    const { overwrites } = peer.flushPwaToMaster();
    expect(overwrites).toEqual([]);
    expect(normalizeTags(peer.master.cards[0].tags)).toEqual(['personal', 'work']);
    expect(peer.master.cards[0].link).toBe(android);
    expect(peer.master.cards[0].icon).toEqual(icon);
    expect(normalizeTags(peer.pwa.cards[0].tags)).toEqual(['personal', 'work']);
    peer.assertConverged();
  });

  it.each(['title', 'username', 'notes', 'link'] as const)(
    'live edit of %s from PWA lands on master',
    (field) => {
      const base = makeCard({ last_update: ts(1) });
      const peer = createPeerVault([base]);
      const next = {
        ...base,
        last_update: ts(2),
        [field]: field === 'link' ? 'https://edited.test' : `edited-${field}`,
      };
      peer.pwaEdit(next as typeof base);
      const { overwrites } = peer.flushPwaToMaster();
      expect(overwrites).toEqual([]);
      expect(peer.master.cards[0][field]).toBe(next[field]);
      peer.assertConverged();
    }
  );

  it('creates a card on the PWA and the master receives it', () => {
    const peer = createPeerVault([]);
    peer.pwaEdit(makeCard({ id: 'new-1', title: 'Fresh', last_update: ts(2) }));
    peer.flushPwaToMaster();
    expect(peer.master.cards.map((c) => c.id)).toEqual(['new-1']);
    peer.assertConverged();
  });

  it('deletes a card from the PWA and the master drops it', () => {
    const peer = createPeerVault([makeCard({ last_update: ts(1) })]);
    peer.pwaDelete('card-1');
    peer.flushPwaToMaster();
    expect(peer.master.cards).toHaveLength(0);
    expect(peer.pwa.cards).toHaveLength(0);
    peer.assertConverged();
  });

  it('NOTE and SECRET_PHRASE round-trip', () => {
    const peer = createPeerVault([]);
    peer.pwaEdit(makeNote({ last_update: ts(2), notes: 'hello' }));
    peer.pwaEdit(makeSeed({ last_update: ts(3) }));
    peer.flushPwaToMaster();
    expect(peer.master.cards).toHaveLength(2);
    expect(peer.master.cards.find((c) => c.type === 'NOTE')?.notes).toBe('hello');
    expect(peer.master.cards.find((c) => c.type === 'SECRET_PHRASE')?.passwordList[0]).toBe(
      'abandon'
    );
    peer.assertConverged();
  });

  it('two sequential PWA clients: title then tags (union, title LWW)', () => {
    const base = makeCard({ title: 'orig', tags: ['a'], last_update: ts(1) });
    const peer = createPeerVault([base]);
    peer.pwaEdit({ ...base, title: 'from-A', last_update: ts(2) });
    peer.flushPwaToMaster();
    peer.pwaEdit({
      ...peer.pwa.cards[0],
      tags: ['a', 'b'],
      last_update: ts(3),
    });
    const { overwrites } = peer.flushPwaToMaster();
    expect(overwrites).toEqual([]);
    expect(peer.master.cards[0].title).toBe('from-A');
    expect(normalizeTags(peer.master.cards[0].tags)).toEqual(['a', 'b']);
    peer.assertConverged();
  });

  it('offline outbox of N upserts + tombstone + settings flushes together', () => {
    const peer = createPeerVault([
      makeCard({ id: 'keep', last_update: ts(1) }),
      makeCard({ id: 'gone', title: 'Gone', last_update: ts(1) }),
    ]);
    peer.pwaEdit(makeCard({ id: 'keep', title: 'Kept-edit', last_update: ts(2) }));
    peer.pwaEdit(makeCard({ id: 'extra', title: 'Extra', last_update: ts(2) }));
    peer.pwaDelete('gone');
    peer.pwaPatchSettings({ groupCardsByLink: true, enableHibpCheck: true });
    peer.flushPwaToMaster();
    expect(peer.master.cards.map((c) => c.id).sort()).toEqual(['extra', 'keep']);
    expect(peer.master.cards.find((c) => c.id === 'keep')?.title).toBe('Kept-edit');
    expect(peer.master.settings.groupCardsByLink).toBe(true);
    expect(peer.master.settings.enableHibpCheck).toBe(true);
    peer.assertConverged();
  });

  it('password is preserved when PWA upsert omits it (empty fill)', () => {
    const base = makeCard({ passwordList: ['vault-secret'], last_update: ts(1) });
    const peer = createPeerVault([base]);
    peer.pwaEdit({ ...base, notes: 'only-notes', passwordList: [''], last_update: ts(2) });
    const { overwrites } = peer.flushPwaToMaster();
    expect(overwrites).toEqual([]);
    expect(peer.master.cards[0].passwordList).toEqual(['vault-secret']);
    expect(peer.master.cards[0].notes).toBe('only-notes');
  });

  it('echo pull does not drop a just-saved tag', () => {
    const base = makeCard({ tags: [], last_update: ts(1) });
    const peer = createPeerVault([base]);
    peer.pwaEdit({ ...base, tags: ['fresh'], last_update: ts(2) });
    peer.flushPwaToMaster();
    expect(peer.pwa.cards[0].tags).toEqual(['fresh']);
    expect(peer.master.cards[0].tags).toEqual(['fresh']);
  });
});
