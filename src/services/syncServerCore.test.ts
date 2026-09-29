/**
 * @fileoverview Unit tests for SyncServerCore auth rate limiting by IP.
 */
import { SyncServerCore } from './syncServerCore';
import { computeChallengeResponse } from './syncAuth';
import type { EncryptedDatabase } from '../types';

const makeDb = (): EncryptedDatabase => ({
  version: '1.0.0',
  creation_date: '2020-01-01T00:00:00.000Z',
  last_update: '2020-01-01T00:00:00.000Z',
  passwordHash: 'a'.repeat(64),
  salt: 'b'.repeat(32),
  sessionId: 'sess',
  cards: [],
  settings: {} as EncryptedDatabase['settings'],
});

describe('SyncServerCore rate limit by IP', () => {
  const clientIp = '192.168.1.50';

  const makeCore = () =>
    new SyncServerCore({
      getDb: makeDb,
      setDb: jest.fn(),
    });

  // Post-audit-M7 the IP rate limiter fires at 3 failures / 15 min instead
  // of 5. These tests were rewritten to match the tighter budget.
  it('blocks after 3 failed auths from same IP even when sourceId changes', () => {
    const core = makeCore();

    for (let i = 0; i < 3; i++) {
      const sourceId = `web-client-${i}`;
      const ch = core.handleChallenge(sourceId, clientIp);
      if ('error' in ch) throw new Error('unexpected challenge error');
      const bad = core.handleAuth(
        sourceId,
        {
          sessionFingerprint: '',
          response: 'bad',
          protocolVersion: 2,
        },
        clientIp
      );
      expect(bad).toMatchObject({ code: 'AUTH_FAILED' });
    }

    const blocked = core.handleChallenge('web-client-new', clientIp);
    expect(blocked).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('resets IP limit after successful auth', () => {
    const core = makeCore();
    const sourceId = 'web-ok';

    const ch = core.handleChallenge(sourceId, clientIp);
    if ('error' in ch) throw new Error('challenge failed');
    const good = core.handleAuth(
      sourceId,
      {
        sessionFingerprint: '',
        response: computeChallengeResponse(ch.challenge, makeDb().passwordHash),
        protocolVersion: 2,
      },
      clientIp
    );
    expect(good).toHaveProperty('token');

    // Use up 2 of the 3 fail budget — must still be allowed to challenge.
    for (let i = 0; i < 2; i++) {
      const sid = `fail-${i}`;
      const c = core.handleChallenge(sid, clientIp);
      if ('error' in c) throw new Error('challenge failed');
      core.handleAuth(
        sid,
        {
          sessionFingerprint: '',
          response: 'wrong',
          protocolVersion: 2,
        },
        clientIp
      );
    }

    const stillOk = core.handleChallenge('another', clientIp);
    expect(stillOk).not.toMatchObject({ code: 'RATE_LIMITED' });

    // 3rd failure triggers the block.
    const c3 = core.handleChallenge('fail-3', clientIp);
    if ('error' in c3) throw new Error('challenge failed');
    core.handleAuth(
      'fail-3',
      {
        sessionFingerprint: '',
        response: 'wrong',
        protocolVersion: 2,
      },
      clientIp
    );

    const blocked = core.handleChallenge('blocked-now', clientIp);
    expect(blocked).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('manual blockSource does not use IP set', () => {
    const core = makeCore();
    core.blockSource('satellite-1');
    expect(core.isBlockedSource('satellite-1')).toBe(true);
    expect(core.isIpBlocked(clientIp)).toBe(false);
  });

  it('manual blockIp blocks connection by IP', () => {
    const core = makeCore();
    core.blockIp(clientIp);
    expect(core.isIpBlocked(clientIp)).toBe(true);
    const ch = core.handleChallenge('any', clientIp);
    expect(ch).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('treats IPv4-mapped IPv6 as the same blocked address', () => {
    const core = makeCore();
    core.blockIp('::ffff:192.168.1.20');
    expect(core.isIpBlocked('192.168.1.20')).toBe(true);
    expect(core.isIpBlocked('::ffff:192.168.1.20')).toBe(true);
    expect(core.handleChallenge('any', '::ffff:192.168.1.20')).toMatchObject({
      code: 'RATE_LIMITED',
    });
    core.unblockIp('192.168.1.20');
    expect(core.isIpBlocked('::ffff:192.168.1.20')).toBe(false);
  });
});

describe('SyncServerCore server proof', () => {
  const HOST_PROOF = 'ab'.repeat(32);
  const makeCore = () =>
    new SyncServerCore({
      getDb: makeDb,
      setDb: jest.fn(),
      getHostProofSecret: () => HOST_PROOF,
    });

  it('proves possession of the pairing secret, not the vault verifier', () => {
    const { computeHostProof, computeServerProof, HOST_PROOF_KIND } =
      require('@pkey/core') as typeof import('@pkey/core');
    const ch = makeCore().handleChallenge('web-1', '10.0.0.5', 'nonce-abc');
    if ('error' in ch) throw new Error('challenge failed');
    expect(ch.serverProof).toBe(computeHostProof('nonce-abc', HOST_PROOF));
    expect(ch.serverProof).not.toBe(computeServerProof('nonce-abc', makeDb().passwordHash));
    expect(ch.proofKind).toBe(HOST_PROOF_KIND);
  });

  it('omits the proof when the client sent no nonce (nothing to bind it to)', () => {
    const ch = makeCore().handleChallenge('web-1', '10.0.0.5');
    if ('error' in ch) throw new Error('challenge failed');
    expect(ch.serverProof).toBeUndefined();
    expect(ch.proofKind).toBeUndefined();
  });

  it('forwards the nonce from a WS challenge_request', async () => {
    const { computeHostProof, HOST_PROOF_KIND } =
      require('@pkey/core') as typeof import('@pkey/core');
    const sent: Record<string, unknown>[] = [];
    const session = makeCore().createWsSession((msg) => {
      sent.push(msg as Record<string, unknown>);
    }, '10.0.0.5');

    await session.onMessage({
      type: 'challenge_request',
      sourceId: 'ws-client-1',
      clientNonce: 'nonce-xyz',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36',
    });
    const challengeMsg = sent.find((m) => m.type === 'challenge');
    expect(challengeMsg?.serverProof).toBe(computeHostProof('nonce-xyz', HOST_PROOF));
    expect(challengeMsg?.proofKind).toBe(HOST_PROOF_KIND);
    expect(session.userAgent).toContain('Chrome/131');
  });
});

describe('SyncServerCore WS session block mid-sync', () => {
  const clientIp = '10.0.0.9';

  it('auth then sync_push ok; blockSource forces close on next sync_push', async () => {
    const { decryptAuthOk, encryptSyncPushWire, emptySyncIndex } =
      require('@pkey/core') as typeof import('@pkey/core');
    const db = makeDb();
    const core = new SyncServerCore({
      getDb: () => db,
      setDb: jest.fn(async (next) => {
        Object.assign(db, next);
      }),
    });

    const sent: Record<string, unknown>[] = [];
    const session = core.createWsSession((msg) => {
      sent.push(msg as Record<string, unknown>);
    }, clientIp);

    await session.onMessage({ type: 'challenge_request', sourceId: 'ws-client-1' });
    const challengeMsg = sent.find((m) => m.type === 'challenge') as
      { challenge: string } | undefined;
    expect(challengeMsg?.challenge).toBeTruthy();

    await session.onMessage({
      type: 'auth',
      response: computeChallengeResponse(challengeMsg!.challenge, db.passwordHash),
      protocolVersion: 2,
    });
    expect(session.authenticated).toBe(true);
    const authOk = sent.find((m) => m.type === 'auth_ok') as {
      encryptedPayload: { salt: string; iv: string; ciphertext: string; hmac: string };
    };
    const decoded = decryptAuthOk(authOk.encryptedPayload, db.passwordHash);
    expect(decoded?.token).toBeTruthy();
    expect(decoded?.hostProofSecret).toHaveLength(64);

    sent.length = 0;
    await session.onMessage({
      type: 'sync_push',
      protocolVersion: 2,
      encryptedPayload: encryptSyncPushWire(
        decoded!.token,
        {
          index: emptySyncIndex(),
          upserts: [],
          deletions: [],
          tombstones: [],
        },
        db.passwordHash
      ),
    });
    expect(session.forceClose).toBe(false);
    expect(sent.some((m) => m.type === 'sync_pull' || m.type === 'error')).toBe(true);
    expect(sent.find((m) => m.type === 'error')).toBeUndefined();

    core.blockSource('ws-client-1');
    sent.length = 0;
    await session.onMessage({
      type: 'sync_push',
      protocolVersion: 2,
      encryptedPayload: encryptSyncPushWire(
        decoded!.token,
        {
          index: emptySyncIndex(),
          upserts: [],
          deletions: [],
          tombstones: [],
        },
        db.passwordHash
      ),
    });
    expect(session.forceClose).toBe(true);
    expect(sent.some((m) => m.type === 'error')).toBe(true);
  });
});

describe('SyncServerCore.getPublicUiPrefs', () => {
  it('returns normalized language and theme from the live vault', () => {
    const db = makeDb();
    db.settings = { ...db.settings, language: 'ESP', theme: 'AUTO' };
    const core = new SyncServerCore({
      getDb: () => db,
      setDb: jest.fn(),
    });
    expect(core.getPublicUiPrefs()).toEqual({
      language: 'ESP',
      theme: 'AUTO',
      sessionCreatedAt: '2020-01-01T00:00:00.000Z',
    });
  });

  it('advertises AUTO language the same as AUTO theme', () => {
    const db = makeDb();
    db.settings = { ...db.settings, language: 'AUTO', theme: 'AUTO' };
    const core = new SyncServerCore({
      getDb: () => db,
      setDb: jest.fn(),
    });
    expect(core.getPublicUiPrefs()).toEqual({
      language: 'AUTO',
      theme: 'AUTO',
      sessionCreatedAt: '2020-01-01T00:00:00.000Z',
    });
  });

  it('prefers PWA webTheme/webLanguage over mobile theme/language', () => {
    const db = makeDb();
    db.settings = {
      ...db.settings,
      language: 'ESP',
      theme: 'DARK',
      webLanguage: 'ING',
      webTheme: 'LIGHT',
    };
    const core = new SyncServerCore({
      getDb: () => db,
      setDb: jest.fn(),
    });
    expect(core.getPublicUiPrefs()).toEqual({
      language: 'ING',
      theme: 'LIGHT',
      sessionCreatedAt: '2020-01-01T00:00:00.000Z',
    });
  });

  it('advertises a hex vault session id when the live db has one', () => {
    const db = makeDb();
    db.sessionId = '550e8400-e29b-41d4-a716-446655440000';
    const core = new SyncServerCore({
      getDb: () => db,
      setDb: jest.fn(),
    });
    expect(core.getPublicUiPrefs()?.sessionId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('advertises webLoginOnPhone only when the setting is on', () => {
    const db = makeDb();
    db.settings = { ...db.settings, language: 'ESP', theme: 'AUTO', webLoginOnPhone: true };
    const core = new SyncServerCore({
      getDb: () => db,
      setDb: jest.fn(),
    });
    expect(core.getPublicUiPrefs()?.webLoginOnPhone).toBe(true);
    db.settings = { ...db.settings, webLoginOnPhone: false };
    expect(core.getPublicUiPrefs()?.webLoginOnPhone).toBeUndefined();
  });
});

describe('SyncServerCore live PWA tag upsert', () => {
  it('merges a newer tag-only upsert without onFieldOverwrites', async () => {
    const { decryptAuthOk, encryptSyncPushWire, buildSyncIndex, SYNC_PROTOCOL_VERSION } =
      require('@pkey/core') as typeof import('@pkey/core');
    const existing = {
      id: 'card-1',
      type: 'PASSWORD' as const,
      title: 'IG',
      icon: { type: 'icon' as const, value: 'logo-instagram' },
      username: 'u',
      passwordList: ['secret'],
      link: 'android://x@com.instagram.android/',
      notes: '',
      creation_date: '2020-01-01T00:00:00.000Z',
      last_update: '2020-01-01T00:00:00.000Z',
      tags: ['work'],
    };
    const db = makeDb();
    db.cards = [existing];
    const overwritesFn = jest.fn();
    const core = new SyncServerCore({
      getDb: () => db,
      setDb: jest.fn(async (next) => {
        Object.assign(db, next);
      }),
      onFieldOverwrites: overwritesFn,
    });
    const sent: Record<string, unknown>[] = [];
    const session = core.createWsSession((msg) => {
      sent.push(msg as Record<string, unknown>);
    }, '10.0.0.20');

    await session.onMessage({ type: 'challenge_request', sourceId: 'pwa-tags' });
    const challengeMsg = sent.find((m) => m.type === 'challenge') as { challenge: string };
    await session.onMessage({
      type: 'auth',
      response: computeChallengeResponse(challengeMsg.challenge, db.passwordHash),
      protocolVersion: 2,
    });
    const authOk = sent.find((m) => m.type === 'auth_ok') as {
      encryptedPayload: { salt: string; iv: string; ciphertext: string; hmac: string };
    };
    const decoded = decryptAuthOk(authOk.encryptedPayload, db.passwordHash);

    const upsert = {
      ...existing,
      tags: ['work', 'personal'],
      last_update: '2021-01-01T00:00:00.000Z',
    };
    await session.onMessage({
      type: 'sync_push',
      protocolVersion: 2,
      encryptedPayload: encryptSyncPushWire(
        decoded!.token,
        {
          index: buildSyncIndex(db),
          upserts: [upsert],
          deletions: [],
          tombstones: [],
        },
        db.passwordHash
      ),
    });
    expect(overwritesFn).not.toHaveBeenCalled();
    expect(db.cards[0].tags?.slice().sort()).toEqual(['personal', 'work']);
  });
});

describe('SyncServerCore vault fork', () => {
  const clientIp = '10.0.0.30';
  const phoneCard = {
    id: 'phone-1',
    type: 'PASSWORD' as const,
    title: 'Test',
    icon: { type: 'icon' as const, value: 'globe' },
    username: '',
    passwordList: ['local'],
    link: '',
    notes: '',
    creation_date: '2020-01-01T00:00:00.000Z',
    last_update: '2020-01-01T00:00:00.000Z',
    tags: [],
  };
  const pwaCard = {
    ...phoneCard,
    id: 'pwa-1',
    title: 'Browser',
    passwordList: ['remote'],
  };

  async function authSession(core: SyncServerCore, db: EncryptedDatabase, sourceId: string) {
    const { decryptAuthOk } = require('@pkey/core') as typeof import('@pkey/core');
    const sent: Record<string, unknown>[] = [];
    const session = core.createWsSession((msg) => {
      sent.push(msg as Record<string, unknown>);
    }, clientIp);
    await session.onMessage({ type: 'challenge_request', sourceId });
    const challengeMsg = sent.find((m) => m.type === 'challenge') as { challenge: string };
    await session.onMessage({
      type: 'auth',
      response: computeChallengeResponse(challengeMsg.challenge, db.passwordHash),
      protocolVersion: 2,
    });
    const authOk = sent.find((m) => m.type === 'auth_ok') as {
      encryptedPayload: { salt: string; iv: string; ciphertext: string; hmac: string };
    };
    const decoded = decryptAuthOk(authOk.encryptedPayload, db.passwordHash);
    sent.length = 0;
    return { session, sent, token: decoded!.token };
  }

  it('ignores vault_fork before auth', async () => {
    const onVaultFork = jest.fn();
    const core = new SyncServerCore({ getDb: makeDb, setDb: jest.fn(), onVaultFork });
    const sent: Record<string, unknown>[] = [];
    const session = core.createWsSession((msg) => {
      sent.push(msg as Record<string, unknown>);
    }, clientIp);
    await session.onMessage({ type: 'vault_fork', pwaCardCount: 300 });
    expect(onVaultFork).not.toHaveBeenCalled();
    expect(sent.some((m) => m.type === 'error')).toBe(true);
  });

  it('emits onVaultFork after auth and does not merge', async () => {
    const db = makeDb();
    db.cards = [phoneCard];
    const onVaultFork = jest.fn();
    const core = new SyncServerCore({
      getDb: () => db,
      setDb: jest.fn(),
      onVaultFork,
    });
    const { session, token } = await authSession(core, db, 'pwa-fork');
    const { encryptControlWire, wrapControlInner, VAULT_FORK_TYPE } =
      require('@pkey/core') as typeof import('@pkey/core');
    await session.onMessage(
      encryptControlWire(
        VAULT_FORK_TYPE,
        wrapControlInner(token, { pwaCardCount: 300, encryptedOnly: false }),
        db.passwordHash
      )
    );
    expect(onVaultFork).toHaveBeenCalledWith({
      sourceId: 'pwa-fork',
      pwaCardCount: 300,
      encryptedOnly: false,
    });
    expect(db.cards).toHaveLength(1);
  });

  it('rejects incremental sync while vault fork is pending', async () => {
    const {
      encryptSyncPushWire,
      emptySyncIndex,
      encryptControlWire,
      wrapControlInner,
      VAULT_FORK_TYPE,
    } = require('@pkey/core') as typeof import('@pkey/core');
    const db = makeDb();
    db.cards = [phoneCard];
    const setDb = jest.fn(async (next: EncryptedDatabase) => {
      Object.assign(db, next);
    });
    const core = new SyncServerCore({ getDb: () => db, setDb });
    const { session, sent, token } = await authSession(core, db, 'pwa-fork');
    await session.onMessage(
      encryptControlWire(
        VAULT_FORK_TYPE,
        wrapControlInner(token, { pwaCardCount: 1, encryptedOnly: false }),
        db.passwordHash
      )
    );
    expect(core.isVaultForkPending('pwa-fork')).toBe(true);
    sent.length = 0;
    await session.onMessage({
      type: 'sync_push',
      protocolVersion: 2,
      encryptedPayload: encryptSyncPushWire(
        token,
        {
          index: emptySyncIndex(),
          upserts: [pwaCard],
          deletions: [],
          tombstones: [],
        },
        db.passwordHash
      ),
    });
    expect(sent.some((m) => m.type === 'error')).toBe(true);
    expect(db.cards.map((c) => c.id)).toEqual(['phone-1']);
    expect(setDb).not.toHaveBeenCalled();
  });

  it('ignores plaintext vault_fork after auth', async () => {
    const db = makeDb();
    const onVaultFork = jest.fn();
    const core = new SyncServerCore({ getDb: () => db, setDb: jest.fn(), onVaultFork });
    const { session } = await authSession(core, db, 'pwa-fork');
    await session.onMessage({ type: 'vault_fork', pwaCardCount: 300 });
    expect(onVaultFork).not.toHaveBeenCalled();
  });

  it('rejects replaceVault until allowVaultReplace', async () => {
    const { encryptSyncPushWire, emptySyncIndex } =
      require('@pkey/core') as typeof import('@pkey/core');
    const db = makeDb();
    db.cards = [phoneCard];
    const setDb = jest.fn(async (next: EncryptedDatabase) => {
      Object.assign(db, next);
    });
    const core = new SyncServerCore({ getDb: () => db, setDb });
    const { session, sent, token } = await authSession(core, db, 'pwa-fork');
    await session.onMessage({
      type: 'sync_push',
      protocolVersion: 2,
      encryptedPayload: encryptSyncPushWire(
        token,
        {
          index: emptySyncIndex(),
          upserts: [pwaCard],
          deletions: [],
          tombstones: [],
          replaceVault: true,
        },
        db.passwordHash
      ),
    });
    expect(sent.some((m) => m.type === 'error')).toBe(true);
    expect(db.cards.map((c) => c.id)).toEqual(['phone-1']);
  });

  it('replaces the phone vault when authorized (no 300+1 merge)', async () => {
    const { encryptSyncPushWire, emptySyncIndex } =
      require('@pkey/core') as typeof import('@pkey/core');
    const db = makeDb();
    db.cards = [phoneCard];
    const setDb = jest.fn(async (next: EncryptedDatabase) => {
      Object.assign(db, next);
    });
    const core = new SyncServerCore({ getDb: () => db, setDb });
    const { session, sent, token } = await authSession(core, db, 'pwa-fork');
    core.allowVaultReplace('pwa-fork');
    await session.onMessage({
      type: 'sync_push',
      protocolVersion: 2,
      encryptedPayload: encryptSyncPushWire(
        token,
        {
          index: emptySyncIndex(),
          upserts: [pwaCard],
          deletions: [],
          tombstones: [],
          replaceVault: true,
        },
        db.passwordHash
      ),
    });
    expect(sent.find((m) => m.type === 'error')).toBeUndefined();
    expect(db.cards.map((c) => c.id)).toEqual(['pwa-1']);
    expect(db.tombstones?.some((t) => t.id === 'phone-1')).toBe(true);
  });
});

describe('SyncServerCore action confirm', () => {
  const clientIp = '192.168.1.50';
  const requestFields = {
    requestId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    action: 'delete' as const,
    cardId: 'card-1',
  };

  function sealConfirm(
    token: string,
    passwordHash: string,
    fields: Record<string, unknown> = requestFields,
    type: string = 'action_confirm_request'
  ) {
    const { encryptControlWire, wrapControlInner } =
      require('@pkey/core') as typeof import('@pkey/core');
    return encryptControlWire(type, wrapControlInner(token, fields), passwordHash);
  }

  async function authSession(
    core: SyncServerCore,
    db: EncryptedDatabase,
    sourceId: string,
    ip = clientIp
  ) {
    const sent: Record<string, unknown>[] = [];
    const session = core.createWsSession((msg) => {
      sent.push(msg as Record<string, unknown>);
    }, ip);
    await session.onMessage({ type: 'challenge_request', sourceId });
    const challengeMsg = sent.find((m) => m.type === 'challenge') as { challenge: string };
    await session.onMessage({
      type: 'auth',
      response: computeChallengeResponse(challengeMsg.challenge, db.passwordHash),
      protocolVersion: 2,
    });
    const authOk = sent.find((m) => m.type === 'auth_ok') as {
      encryptedPayload: { salt: string; iv: string; ciphertext: string; hmac: string };
    };
    const { decryptAuthOk } = require('@pkey/core') as typeof import('@pkey/core');
    const decoded = decryptAuthOk(authOk.encryptedPayload, db.passwordHash);
    sent.length = 0;
    return { session, sent, token: decoded!.token };
  }

  it('ignores action_confirm_request before auth', async () => {
    const onActionConfirm = jest.fn();
    const core = new SyncServerCore({ getDb: makeDb, setDb: jest.fn(), onActionConfirm });
    const sent: Record<string, unknown>[] = [];
    const session = core.createWsSession((msg) => {
      sent.push(msg as Record<string, unknown>);
    }, clientIp);
    await session.onMessage({ type: 'action_confirm_request', ...requestFields });
    expect(onActionConfirm).not.toHaveBeenCalled();
    expect(sent.some((m) => m.type === 'error')).toBe(true);
  });

  it('ignores plaintext action_confirm_request after auth', async () => {
    const db = makeDb();
    const onActionConfirm = jest.fn();
    const core = new SyncServerCore({ getDb: () => db, setDb: jest.fn(), onActionConfirm });
    const { session, sent } = await authSession(core, db, 'pwa-confirm');
    await session.onMessage({ type: 'action_confirm_request', ...requestFields });
    expect(onActionConfirm).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it('emits onActionConfirm after auth', async () => {
    const db = makeDb();
    const onActionConfirm = jest.fn();
    const core = new SyncServerCore({ getDb: () => db, setDb: jest.fn(), onActionConfirm });
    const { session, token } = await authSession(core, db, 'pwa-confirm');
    await session.onMessage(sealConfirm(token, db.passwordHash));
    expect(onActionConfirm).toHaveBeenCalledWith({
      sourceId: 'pwa-confirm',
      requestId: requestFields.requestId,
      action: 'delete',
      cardId: 'card-1',
    });
  });

  it('replaces a pending confirm from the same source', async () => {
    const db = makeDb();
    const onActionConfirm = jest.fn();
    const onActionConfirmCancelled = jest.fn();
    const core = new SyncServerCore({
      getDb: () => db,
      setDb: jest.fn(),
      onActionConfirm,
      onActionConfirmCancelled,
    });
    const { session, token } = await authSession(core, db, 'pwa-confirm');
    await session.onMessage(sealConfirm(token, db.passwordHash));
    const nextId = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
    await session.onMessage(
      sealConfirm(token, db.passwordHash, { ...requestFields, requestId: nextId, action: 'copy' })
    );
    expect(onActionConfirmCancelled).toHaveBeenCalledWith({
      sourceId: 'pwa-confirm',
      requestId: requestFields.requestId,
    });
    expect(onActionConfirm).toHaveBeenLastCalledWith({
      sourceId: 'pwa-confirm',
      requestId: nextId,
      action: 'copy',
      cardId: 'card-1',
    });
  });

  it('returns encrypted busy when another source already has a pending confirm', async () => {
    const db = makeDb();
    const onActionConfirm = jest.fn();
    const core = new SyncServerCore({ getDb: () => db, setDb: jest.fn(), onActionConfirm });
    const a = await authSession(core, db, 'pwa-a');
    const b = await authSession(core, db, 'pwa-b', '192.168.1.51');
    await a.session.onMessage(sealConfirm(a.token, db.passwordHash));
    b.sent.length = 0;
    const busyId = 'cccccccc-dddd-eeee-ffff-000000000000';
    await b.session.onMessage(
      sealConfirm(b.token, db.passwordHash, { ...requestFields, requestId: busyId })
    );
    expect(b.sent).toHaveLength(1);
    expect(b.sent[0].type).toBe('action_confirm_result');
    expect(b.sent[0].ok).toBeUndefined();
    expect(b.sent[0].requestId).toBeUndefined();
    const { decryptControlWire } = require('@pkey/core') as typeof import('@pkey/core');
    const inner = decryptControlWire(b.sent[0], db.passwordHash);
    expect(inner).toMatchObject({
      requestId: busyId,
      action: 'delete',
      cardId: 'card-1',
      ok: false,
      reason: 'busy',
    });
    expect(onActionConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending confirm when the client disconnects', async () => {
    const db = makeDb();
    const onActionConfirmCancelled = jest.fn();
    const core = new SyncServerCore({
      getDb: () => db,
      setDb: jest.fn(),
      onActionConfirm: jest.fn(),
      onActionConfirmCancelled,
    });
    const { session, token } = await authSession(core, db, 'pwa-confirm');
    await session.onMessage(sealConfirm(token, db.passwordHash));
    session.onClose();
    expect(onActionConfirmCancelled).toHaveBeenCalledWith({
      sourceId: 'pwa-confirm',
      requestId: requestFields.requestId,
    });
  });

  it('does not let a satellite settings push enable webConfirmOnPhone', async () => {
    const { encryptSyncPushWire, emptySyncIndex } =
      require('@pkey/core') as typeof import('@pkey/core');
    const db = makeDb();
    db.settings = { ...db.settings, webConfirmOnPhone: false } as EncryptedDatabase['settings'];
    const setDb = jest.fn(async (next: EncryptedDatabase) => {
      Object.assign(db, next);
    });
    const core = new SyncServerCore({ getDb: () => db, setDb });
    const { session, token } = await authSession(core, db, 'pwa-settings');
    await session.onMessage({
      type: 'sync_push',
      protocolVersion: 2,
      encryptedPayload: encryptSyncPushWire(
        token,
        {
          index: emptySyncIndex(),
          upserts: [],
          deletions: [],
          tombstones: [],
          settings: { ...db.settings, webConfirmOnPhone: true },
        },
        db.passwordHash
      ),
    });
    expect(db.settings.webConfirmOnPhone).toBe(false);
  });

  it('does not let a satellite settings push enable webLoginOnPhone', async () => {
    const { encryptSyncPushWire, emptySyncIndex } =
      require('@pkey/core') as typeof import('@pkey/core');
    const db = makeDb();
    db.settings = { ...db.settings, webLoginOnPhone: false } as EncryptedDatabase['settings'];
    const setDb = jest.fn(async (next: EncryptedDatabase) => {
      Object.assign(db, next);
    });
    const core = new SyncServerCore({ getDb: () => db, setDb });
    const { session, token } = await authSession(core, db, 'pwa-settings-login');
    await session.onMessage({
      type: 'sync_push',
      protocolVersion: 2,
      encryptedPayload: encryptSyncPushWire(
        token,
        {
          index: emptySyncIndex(),
          upserts: [],
          deletions: [],
          tombstones: [],
          settings: { ...db.settings, webLoginOnPhone: true },
        },
        db.passwordHash
      ),
    });
    expect(db.settings.webLoginOnPhone).toBe(false);
  });
});

describe('SyncServerCore idempotent persist', () => {
  const clientIp = '10.0.0.40';

  async function authSession(core: SyncServerCore, db: EncryptedDatabase, sourceId: string) {
    const { decryptAuthOk } = require('@pkey/core') as typeof import('@pkey/core');
    const sent: Record<string, unknown>[] = [];
    const session = core.createWsSession((msg) => {
      sent.push(msg as Record<string, unknown>);
    }, clientIp);
    await session.onMessage({ type: 'challenge_request', sourceId });
    const challengeMsg = sent.find((m) => m.type === 'challenge') as { challenge: string };
    await session.onMessage({
      type: 'auth',
      response: computeChallengeResponse(challengeMsg.challenge, db.passwordHash),
      protocolVersion: 2,
    });
    const authOk = sent.find((m) => m.type === 'auth_ok') as {
      encryptedPayload: { salt: string; iv: string; ciphertext: string; hmac: string };
    };
    const decoded = decryptAuthOk(authOk.encryptedPayload, db.passwordHash);
    sent.length = 0;
    return { session, sent, token: decoded!.token };
  }

  it('does not persist two empty sync_push pulls', async () => {
    const { encryptSyncPushWire, emptySyncIndex } =
      require('@pkey/core') as typeof import('@pkey/core');
    const db = makeDb();
    const setDb = jest.fn(async (next: EncryptedDatabase) => {
      Object.assign(db, next);
    });
    const core = new SyncServerCore({ getDb: () => db, setDb });
    const { session, sent, token } = await authSession(core, db, 'pwa-noop');
    const emptyPush = {
      type: 'sync_push' as const,
      protocolVersion: 2,
      encryptedPayload: encryptSyncPushWire(
        token,
        { index: emptySyncIndex(), upserts: [], deletions: [], tombstones: [] },
        db.passwordHash
      ),
    };
    await session.onMessage(emptyPush);
    await session.onMessage(emptyPush);
    expect(setDb).not.toHaveBeenCalled();
    expect(sent.filter((m) => m.type === 'sync_pull')).toHaveLength(2);
  });

  it('persists a card upsert then skips a matching empty pull', async () => {
    const { encryptSyncPushWire, emptySyncIndex } =
      require('@pkey/core') as typeof import('@pkey/core');
    const db = makeDb();
    const setDb = jest.fn(async (next: EncryptedDatabase) => {
      Object.assign(db, next);
    });
    const core = new SyncServerCore({ getDb: () => db, setDb });
    const { session, token } = await authSession(core, db, 'pwa-upsert');
    const card = {
      id: 'card-1',
      type: 'PASSWORD' as const,
      title: 'New',
      icon: { type: 'icon' as const, value: 'globe' },
      username: 'u',
      passwordList: ['pw'],
      link: '',
      notes: '',
      creation_date: '2020-01-01T00:00:00.000Z',
      last_update: '2021-01-01T00:00:00.000Z',
      tags: [],
    };
    await session.onMessage({
      type: 'sync_push',
      protocolVersion: 2,
      encryptedPayload: encryptSyncPushWire(
        token,
        { index: emptySyncIndex(), upserts: [card], deletions: [], tombstones: [] },
        db.passwordHash
      ),
    });
    expect(setDb).toHaveBeenCalledTimes(1);
    await session.onMessage({
      type: 'sync_push',
      protocolVersion: 2,
      encryptedPayload: encryptSyncPushWire(
        token,
        { index: emptySyncIndex(), upserts: [], deletions: [], tombstones: [] },
        db.passwordHash
      ),
    });
    expect(setDb).toHaveBeenCalledTimes(1);
  });

  it('persists a webTheme change once', async () => {
    const { encryptSyncPushWire, emptySyncIndex } =
      require('@pkey/core') as typeof import('@pkey/core');
    const db = makeDb();
    db.settings = { ...db.settings, webTheme: 'DARK' } as EncryptedDatabase['settings'];
    const setDb = jest.fn(async (next: EncryptedDatabase) => {
      Object.assign(db, next);
    });
    const core = new SyncServerCore({ getDb: () => db, setDb });
    const { session, token } = await authSession(core, db, 'pwa-theme');
    const pushTheme = (theme: 'LIGHT' | 'DARK') =>
      session.onMessage({
        type: 'sync_push',
        protocolVersion: 2,
        encryptedPayload: encryptSyncPushWire(
          token,
          {
            index: emptySyncIndex(),
            upserts: [],
            deletions: [],
            tombstones: [],
            settings: { webTheme: theme },
          },
          db.passwordHash
        ),
      });
    await pushTheme('LIGHT');
    expect(setDb).toHaveBeenCalledTimes(1);
    expect(db.settings.webTheme).toBe('LIGHT');
    await pushTheme('LIGHT');
    expect(setDb).toHaveBeenCalledTimes(1);
  });

  it('ignores upserts on sync_pull_request', async () => {
    const { encryptSyncPushWire, emptySyncIndex, SYNC_PULL_REQUEST_TYPE } =
      require('@pkey/core') as typeof import('@pkey/core');
    const db = makeDb();
    const setDb = jest.fn(async (next: EncryptedDatabase) => {
      Object.assign(db, next);
    });
    const core = new SyncServerCore({ getDb: () => db, setDb });
    const { session, sent, token } = await authSession(core, db, 'pwa-pull');
    const card = {
      id: 'sneak',
      type: 'PASSWORD' as const,
      title: 'Nope',
      icon: { type: 'icon' as const, value: 'globe' },
      username: '',
      passwordList: ['x'],
      link: '',
      notes: '',
      creation_date: '2020-01-01T00:00:00.000Z',
      last_update: '2021-01-01T00:00:00.000Z',
      tags: [],
    };
    await session.onMessage({
      type: SYNC_PULL_REQUEST_TYPE,
      protocolVersion: 2,
      encryptedPayload: encryptSyncPushWire(
        token,
        { index: emptySyncIndex(), upserts: [card], deletions: [], tombstones: [] },
        db.passwordHash
      ),
    });
    expect(setDb).not.toHaveBeenCalled();
    expect(db.cards).toHaveLength(0);
    expect(sent.some((m) => m.type === 'sync_pull')).toBe(true);
  });
});

describe('SyncServerCore pre-auth unlock', () => {
  const clientIp = '192.168.1.50';
  const requestId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  function unlockFields() {
    const { generateUnlockKeypair } = require('@pkey/core') as typeof import('@pkey/core');
    const client = generateUnlockKeypair();
    return {
      client,
      msg: {
        type: 'unlock_request',
        requestId,
        sourceId: 'pwa-unlock',
        clientPub: client.publicKeyHex,
        nonce: 'ab'.repeat(16),
      },
    };
  }

  it('ignores malformed unlock_request without UI', async () => {
    const onUnlockRequest = jest.fn();
    const db = makeDb();
    db.settings = { ...db.settings, webLoginOnPhone: true } as EncryptedDatabase['settings'];
    const core = new SyncServerCore({ getDb: () => db, setDb: jest.fn(), onUnlockRequest });
    const sent: Record<string, unknown>[] = [];
    const session = core.createWsSession((msg) => {
      sent.push(msg as Record<string, unknown>);
    }, clientIp);
    await session.onMessage({ type: 'unlock_request', requestId: 'nope' });
    expect(onUnlockRequest).not.toHaveBeenCalled();
    expect(sent.some((m) => m.type === 'unlock_offer')).toBe(false);
  });

  it('ignores unlock_request when the setting is off', async () => {
    const onUnlockRequest = jest.fn();
    const db = makeDb();
    db.settings = { ...db.settings, webLoginOnPhone: false } as EncryptedDatabase['settings'];
    const core = new SyncServerCore({ getDb: () => db, setDb: jest.fn(), onUnlockRequest });
    const sent: Record<string, unknown>[] = [];
    const session = core.createWsSession((msg) => {
      sent.push(msg as Record<string, unknown>);
    }, clientIp);
    await session.onMessage(unlockFields().msg);
    expect(onUnlockRequest).not.toHaveBeenCalled();
    expect(sent.some((m) => m.type === 'unlock_offer')).toBe(false);
  });

  it('emits onUnlockRequest and unlock_offer when the setting is on', async () => {
    const onUnlockRequest = jest.fn();
    const db = makeDb();
    db.settings = { ...db.settings, webLoginOnPhone: true } as EncryptedDatabase['settings'];
    const core = new SyncServerCore({ getDb: () => db, setDb: jest.fn(), onUnlockRequest });
    const sent: Record<string, unknown>[] = [];
    const session = core.createWsSession((msg) => {
      sent.push(msg as Record<string, unknown>);
    }, clientIp);
    await session.onMessage(unlockFields().msg);
    expect(onUnlockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'pwa-unlock',
        requestId,
        sas: expect.stringMatching(/^\d{6}$/),
      })
    );
    expect(sent.some((m) => m.type === 'unlock_offer')).toBe(true);
    const grant = core.buildUnlockGrant('pwa-unlock', requestId);
    expect(grant?.type).toBe('unlock_grant');
  });

  it('rate-limits unlock requests per source', async () => {
    const onUnlockRequest = jest.fn();
    const db = makeDb();
    db.settings = { ...db.settings, webLoginOnPhone: true } as EncryptedDatabase['settings'];
    const core = new SyncServerCore({ getDb: () => db, setDb: jest.fn(), onUnlockRequest });
    const session = core.createWsSession(() => {}, clientIp);
    for (let i = 0; i < 4; i++) {
      const { msg } = unlockFields();
      await session.onMessage({ ...msg, requestId: `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee${i}` });
    }
    expect(onUnlockRequest).toHaveBeenCalledTimes(3);
  });
});
