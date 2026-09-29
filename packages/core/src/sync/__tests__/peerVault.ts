/**
 * @fileoverview In-memory master + PWA vault pair for sync round-trip tests.
 *
 * Mirrors SyncServerCore.processSync (mergeCards + computeOutgoingDelta) and
 * PWA applyPull (mergePullLocally) without React Native or a browser.
 */
import { encryptSyncPushWire, decryptSyncPushWire } from '../encryptedChannel';
import { mergeCards, mergePullLocally, mergeTombstones } from '../merge';
import { buildSyncIndex, computeOutgoingDelta, computeDbVersionHash } from '../delta';
import { mergeVaultSettings } from '../../vault/settings';
import { DEFAULT_VAULT_SETTINGS } from '../../vault/password-generator';
import { deriveAuthHash } from '../../crypto/index';
import { SYNC_PROTOCOL_VERSION } from '../../types/index';
import type { AppSettings, EncryptedDatabase, PasswordCard, Tombstone } from '../../types/index';

export const PEER_PASSWORD_HASH = deriveAuthHash('peer-vault-secret', 'peer-salt-16bytes');

export function ts(n: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
}

export function makeCard(overrides: Partial<PasswordCard> = {}): PasswordCard {
  const last = overrides.last_update ?? ts(1);
  return {
    id: 'card-1',
    type: 'PASSWORD',
    title: 'Acme',
    icon: { type: 'icon', value: 'key-outline' },
    username: 'user@acme.test',
    passwordList: ['hunter2'],
    link: 'https://acme.test',
    notes: '',
    creation_date: ts(0),
    last_update: last,
    ...overrides,
  };
}

export function makeNote(overrides: Partial<PasswordCard> = {}): PasswordCard {
  return makeCard({
    id: 'note-1',
    type: 'NOTE',
    title: 'Note',
    passwordList: [''],
    username: '',
    link: '',
    ...overrides,
  });
}

export function makeSeed(overrides: Partial<PasswordCard> = {}): PasswordCard {
  return makeCard({
    id: 'seed-1',
    type: 'SECRET_PHRASE',
    title: 'Wallet',
    passwordList: ['abandon', 'ability', 'able', 'about', 'above', 'absent'],
    username: '',
    link: '',
    ...overrides,
  });
}

function emptyDb(cards: PasswordCard[] = [], extra: Partial<EncryptedDatabase> = {}): EncryptedDatabase {
  return {
    version: 1,
    passwordHash: PEER_PASSWORD_HASH,
    salt: 'peer-salt-16bytes',
    cards,
    settings: { ...DEFAULT_VAULT_SETTINGS },
    creation_date: ts(0),
    last_update: ts(0),
    tombstones: [],
    sessionId: 'peer-session',
    syncProtocolVersion: SYNC_PROTOCOL_VERSION,
    ...extra,
  };
}

export interface PeerFlushResult {
  overwrites: { id: string; title: string; fields: string[] }[];
  versionHash: string;
}

export interface PeerVault {
  master: EncryptedDatabase;
  pwa: EncryptedDatabase;
  pendingUpserts: Record<string, PasswordCard>;
  pendingTombstones: Record<string, Tombstone>;
  pendingSettings: AppSettings | null;
  clock: number;
  now: () => string;
  seedBoth: (cards: PasswordCard[]) => void;
  pwaEdit: (card: PasswordCard) => void;
  pwaDelete: (id: string) => void;
  pwaPatchSettings: (patch: Partial<AppSettings>) => void;
  flushPwaToMaster: () => PeerFlushResult;
  versionHash: (side: 'master' | 'pwa') => string;
  assertConverged: () => void;
}

/**
 * Creates a paired in-memory master and PWA vault.
 */
export function createPeerVault(initial: PasswordCard[] = []): PeerVault {
  const peer: PeerVault = {
    master: emptyDb(initial.map((c) => ({ ...c }))),
    pwa: emptyDb(initial.map((c) => ({ ...c }))),
    pendingUpserts: {},
    pendingTombstones: {},
    pendingSettings: null,
    clock: 10,
    now() {
      peer.clock += 1;
      return ts(peer.clock);
    },
    seedBoth(cards) {
      peer.master = emptyDb(cards.map((c) => ({ ...c })));
      peer.pwa = emptyDb(cards.map((c) => ({ ...c })));
      peer.pendingUpserts = {};
      peer.pendingTombstones = {};
      peer.pendingSettings = null;
    },
    pwaEdit(card) {
      const next = { ...card, last_update: card.last_update || peer.now() };
      peer.pwa = {
        ...peer.pwa,
        cards: [...peer.pwa.cards.filter((c) => c.id !== next.id), next],
        last_update: next.last_update,
      };
      delete peer.pendingTombstones[next.id];
      peer.pendingUpserts[next.id] = next;
    },
    pwaDelete(id) {
      const deletedAt = peer.now();
      peer.pwa = {
        ...peer.pwa,
        cards: peer.pwa.cards.filter((c) => c.id !== id),
        tombstones: [...(peer.pwa.tombstones ?? []).filter((t) => t.id !== id), { id, deletedAt }],
        last_update: deletedAt,
      };
      delete peer.pendingUpserts[id];
      peer.pendingTombstones[id] = { id, deletedAt };
    },
    pwaPatchSettings(patch) {
      const merged = mergeVaultSettings(peer.pwa.settings, patch);
      peer.pwa = { ...peer.pwa, settings: merged, last_update: peer.now() };
      peer.pendingSettings = merged;
    },
    flushPwaToMaster() {
      const payload = {
        index: buildSyncIndex(peer.pwa),
        upserts: Object.values(peer.pendingUpserts),
        deletions: [] as string[],
        tombstones: Object.values(peer.pendingTombstones),
        ...(peer.pendingSettings ? { settings: peer.pendingSettings } : {}),
      };
      const wire = encryptSyncPushWire('tok', payload, PEER_PASSWORD_HASH);
      const dec = decryptSyncPushWire(wire, PEER_PASSWORD_HASH);
      if (!dec) throw new Error('peerVault: decrypt failed');
      const { token: _t, ...syncFields } = dec;
      const deletionTombstones = (syncFields.deletions || []).map((id) => ({
        id,
        deletedAt: peer.now(),
      }));
      const { cards, tombstones, overwrites } = mergeCards(
        peer.master.cards,
        syncFields.upserts || [],
        peer.master.tombstones || [],
        mergeTombstones(syncFields.tombstones || [], deletionTombstones)
      );
      peer.master = {
        ...peer.master,
        cards,
        tombstones,
        last_update: peer.now(),
        ...(syncFields.settings
          ? { settings: mergeVaultSettings(peer.master.settings, syncFields.settings) }
          : {}),
      };
      const delta = computeOutgoingDelta(peer.master, syncFields.index);
      const pulled = mergePullLocally(peer.pwa.cards, {
        upserts: delta.upserts,
        deletions: delta.deletions,
        tombstones: peer.master.tombstones,
      });
      peer.pwa = {
        ...peer.pwa,
        cards: pulled.cards,
        tombstones: peer.master.tombstones,
        settings: peer.master.settings,
        last_update: peer.master.last_update,
      };
      peer.pendingUpserts = {};
      peer.pendingTombstones = {};
      peer.pendingSettings = null;
      return { overwrites, versionHash: computeDbVersionHash(peer.master) };
    },
    versionHash(side) {
      return computeDbVersionHash(side === 'master' ? peer.master : peer.pwa);
    },
    assertConverged() {
      const a = computeDbVersionHash(peer.master);
      const b = computeDbVersionHash({ ...peer.pwa, settings: peer.master.settings });
      if (a !== b) {
        throw new Error(`vaults diverged: master=${a} pwa=${b}`);
      }
      const masterIds = [...peer.master.cards.map((c) => c.id)].sort();
      const pwaIds = [...peer.pwa.cards.map((c) => c.id)].sort();
      if (masterIds.join() !== pwaIds.join()) {
        throw new Error(`live ids diverged: master=${masterIds} pwa=${pwaIds}`);
      }
    },
  };
  return peer;
}
