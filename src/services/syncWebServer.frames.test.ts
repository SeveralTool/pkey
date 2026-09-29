/**
 * @fileoverview Robustness tests for the WebSocket transport:
 * frame decoding (size limits, masking, truncation, fuzzing) and
 * malformed-message handling in SyncServerCore WS sessions.
 */
import { tryDecodeWsFrame } from './syncWebServer';
import { MAX_WS_PAYLOAD_BYTES } from './migrationHttpUtils';
import { SyncServerCore, WsMessage } from './syncServerCore';
import { computeChallengeResponse } from './syncAuth';
import type { EncryptedDatabase } from '../types';

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Deterministic LCG so fuzz failures are reproducible. */
function makePrng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

interface FrameOptions {
  opcode?: number;
  fin?: boolean;
  masked?: boolean;
  mask?: [number, number, number, number];
}

/** Encodes a client->server frame (masked by default, per RFC 6455). */
function encodeClientFrame(payload: Buffer, opts: FrameOptions = {}): Buffer {
  const { opcode = 0x1, fin = true, masked = true, mask = [0x12, 0x34, 0x56, 0x78] } = opts;
  const len = payload.length;

  let header: Buffer;
  if (len <= 125) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len <= 65535) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = (fin ? 0x80 : 0x00) | opcode;

  if (!masked) return Buffer.concat([header, payload]);

  header[1] |= 0x80;
  const maskBuf = Buffer.from(mask);
  const maskedPayload = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    maskedPayload[i] = payload[i] ^ mask[i % 4];
  }
  return Buffer.concat([header, maskBuf, maskedPayload]);
}

/* ------------------------------------------------------------------ *
 * tryDecodeWsFrame
 * ------------------------------------------------------------------ */

describe('tryDecodeWsFrame', () => {
  it('decodes a small masked text frame', () => {
    const payload = Buffer.from('{"type":"ping"}', 'utf8');
    const frame = tryDecodeWsFrame(encodeClientFrame(payload));
    expect(frame).toEqual(
      expect.objectContaining({ fin: true, opcode: 0x1, consumed: 2 + 4 + payload.length })
    );
    expect((frame as { payload: Buffer }).payload.toString('utf8')).toBe('{"type":"ping"}');
  });

  it('decodes a frame with 16-bit extended length', () => {
    const payload = Buffer.alloc(300, 0x41);
    const frame = tryDecodeWsFrame(encodeClientFrame(payload));
    expect(frame).toEqual(
      expect.objectContaining({ opcode: 0x1, consumed: 4 + 4 + payload.length })
    );
    expect((frame as { payload: Buffer }).payload.equals(payload)).toBe(true);
  });

  it('rejects unmasked client frames', () => {
    const payload = Buffer.from('hello', 'utf8');
    expect(tryDecodeWsFrame(encodeClientFrame(payload, { masked: false }))).toBe('unmasked');
  });

  it('rejects a declared 64-bit length above MAX_WS_PAYLOAD_BYTES without buffering it', () => {
    // Header only: declares an oversized payload that is never sent.
    const header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(MAX_WS_PAYLOAD_BYTES + 1), 2);
    expect(tryDecodeWsFrame(header)).toBe('too_large');
  });

  it('rejects an absurdly large declared length (memory exhaustion attempt)', () => {
    const header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt('9007199254740991'), 2);
    expect(tryDecodeWsFrame(header)).toBe('too_large');
  });

  it('returns null on truncated inputs (waits for more data)', () => {
    const full = encodeClientFrame(Buffer.from('some payload data', 'utf8'));
    expect(tryDecodeWsFrame(Buffer.alloc(0))).toBeNull();
    expect(tryDecodeWsFrame(full.slice(0, 1))).toBeNull();
    // Header present but payload incomplete.
    expect(tryDecodeWsFrame(full.slice(0, full.length - 1))).toBeNull();

    // Extended 16-bit length field itself truncated.
    const ext = encodeClientFrame(Buffer.alloc(300, 0x41));
    expect(tryDecodeWsFrame(ext.slice(0, 3))).toBeNull();
  });

  it('decodes back-to-back frames from a single buffer via consumed', () => {
    const first = encodeClientFrame(Buffer.from('first', 'utf8'));
    const second = encodeClientFrame(Buffer.from('second', 'utf8'), {
      mask: [0xaa, 0xbb, 0xcc, 0xdd],
    });
    let buf = Buffer.concat([first, second]);

    const f1 = tryDecodeWsFrame(buf);
    expect((f1 as { payload: Buffer }).payload.toString('utf8')).toBe('first');
    buf = buf.slice((f1 as { consumed: number }).consumed);

    const f2 = tryDecodeWsFrame(buf);
    expect((f2 as { payload: Buffer }).payload.toString('utf8')).toBe('second');
    expect(buf.length).toBe((f2 as { consumed: number }).consumed);
  });

  it('exposes fin=false and continuation opcode for fragmented messages', () => {
    const json = Buffer.from('{"type":"sync_push","encryptedPayload":{"x":1}}', 'utf8');
    const mid = Math.floor(json.length / 2);
    const part1 = encodeClientFrame(json.subarray(0, mid), { fin: false, opcode: 0x1 });
    const part2 = encodeClientFrame(json.subarray(mid), { fin: true, opcode: 0x0 });

    const f1 = tryDecodeWsFrame(part1) as {
      fin: boolean;
      opcode: number;
      payload: Buffer;
      consumed: number;
    };
    expect(f1.fin).toBe(false);
    expect(f1.opcode).toBe(0x1);
    expect(f1.payload.toString('utf8')).toBe(json.subarray(0, mid).toString('utf8'));

    const f2 = tryDecodeWsFrame(part2) as {
      fin: boolean;
      opcode: number;
      payload: Buffer;
    };
    expect(f2.fin).toBe(true);
    expect(f2.opcode).toBe(0x0);
    const reassembled = Buffer.concat([f1.payload, f2.payload]).toString('utf8');
    expect(JSON.parse(reassembled)).toEqual({
      type: 'sync_push',
      encryptedPayload: { x: 1 },
    });
  });

  it('never throws on random garbage buffers (fuzz, seeded)', () => {
    const rand = makePrng(0xc0ffee);
    for (let iter = 0; iter < 1000; iter++) {
      const len = Math.floor(rand() * 64);
      const buf = Buffer.alloc(len);
      for (let i = 0; i < len; i++) buf[i] = Math.floor(rand() * 256);

      const result = tryDecodeWsFrame(buf);
      if (result === null || result === 'too_large' || result === 'unmasked') continue;
      // A structurally valid frame must stay within the buffer it came from.
      expect(result.consumed).toBeGreaterThan(0);
      expect(result.consumed).toBeLessThanOrEqual(len);
      expect(result.payload.length).toBeLessThanOrEqual(MAX_WS_PAYLOAD_BYTES);
    }
  });

  it('never throws on corrupted variants of a valid frame (fuzz, seeded)', () => {
    const rand = makePrng(0xdead);
    const valid = encodeClientFrame(Buffer.from('{"type":"challenge_request"}', 'utf8'));
    for (let iter = 0; iter < 500; iter++) {
      const mutated = Buffer.from(valid);
      const flips = 1 + Math.floor(rand() * 4);
      for (let i = 0; i < flips; i++) {
        const pos = Math.floor(rand() * mutated.length);
        mutated[pos] ^= 1 << Math.floor(rand() * 8);
      }
      expect(() => tryDecodeWsFrame(mutated)).not.toThrow();
    }
  });
});

/* ------------------------------------------------------------------ *
 * WS session malformed-message handling
 * ------------------------------------------------------------------ */

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

describe('SyncServerCore WS session with malformed messages', () => {
  const setup = () => {
    const db = makeDb();
    const core = new SyncServerCore({
      getDb: () => db,
      setDb: jest.fn(async (next) => {
        Object.assign(db, next);
      }),
    });
    const sent: WsMessage[] = [];
    const session = core.createWsSession((msg) => {
      sent.push(msg);
    }, '10.1.2.3');
    return { db, core, sent, session };
  };

  it('responds with an error to unknown message types', async () => {
    const { sent, session } = setup();
    await session.onMessage({ type: 'definitely_not_a_type' });
    expect(sent).toEqual([expect.objectContaining({ type: 'error', code: 'UNAUTHORIZED' })]);
  });

  it('handles a message without a type field', async () => {
    const { sent, session } = setup();
    await expect(session.onMessage({} as WsMessage)).resolves.toBeUndefined();
    expect(sent).toEqual([expect.objectContaining({ type: 'error' })]);
  });

  it('rejects sync_push before authentication', async () => {
    const { sent, session } = setup();
    await session.onMessage({ type: 'sync_push', payload: { anything: true } });
    expect(sent).toEqual([expect.objectContaining({ type: 'error', code: 'UNAUTHORIZED' })]);
  });

  it('fails auth cleanly with wrong-typed fields', async () => {
    const { sent, session } = setup();
    await session.onMessage({ type: 'challenge_request', sourceId: 'fuzz-client' });
    sent.length = 0;
    await expect(
      session.onMessage({ type: 'auth', response: 12345, protocolVersion: 2 })
    ).resolves.toBeUndefined();
    expect(session.authenticated).toBe(false);
    expect(sent).toEqual([expect.objectContaining({ type: 'auth_error', code: 'AUTH_FAILED' })]);
  });

  it('handles garbage sync_push payloads after a valid auth without crashing', async () => {
    const { db, sent, session } = setup();

    await session.onMessage({ type: 'challenge_request', sourceId: 'fuzz-client' });
    const challengeMsg = sent.find((m) => m.type === 'challenge') as
      | { challenge: string }
      | undefined;
    await session.onMessage({
      type: 'auth',
      response: computeChallengeResponse(challengeMsg!.challenge, db.passwordHash),
      protocolVersion: 2,
    });
    expect(session.authenticated).toBe(true);

    const garbagePayloads: unknown[] = [
      null,
      42,
      'a string',
      [],
      { ciphertext: 'zz', iv: 'zz' },
      { encryptedPayload: { salt: 'x', iv: 'y', ciphertext: 'z', hmac: 'w' } },
      { index: 'not-an-object' },
      { upserts: 'nope', deletions: 123, tombstones: {} },
    ];
    for (const payload of garbagePayloads) {
      sent.length = 0;
      await expect(
        session.onMessage({ type: 'sync_push', protocolVersion: 2, payload })
      ).resolves.toBeUndefined();
      // Must always answer something (sync_pull or a typed error), never crash.
      expect(sent.length).toBeGreaterThan(0);
    }
  });

  it('handles a garbage encryptedPayload on sync_push without crashing', async () => {
    const { db, sent, session } = setup();

    await session.onMessage({ type: 'challenge_request', sourceId: 'fuzz-client' });
    const challengeMsg = sent.find((m) => m.type === 'challenge') as
      | { challenge: string }
      | undefined;
    await session.onMessage({
      type: 'auth',
      response: computeChallengeResponse(challengeMsg!.challenge, db.passwordHash),
      protocolVersion: 2,
    });

    sent.length = 0;
    await expect(
      session.onMessage({
        type: 'sync_push',
        protocolVersion: 2,
        encryptedPayload: { salt: '00', iv: '00', ciphertext: '00', hmac: '00' },
      })
    ).resolves.toBeUndefined();
    expect(sent).toEqual([expect.objectContaining({ type: 'error' })]);
  });

  it('never rejects on fuzzed message objects (seeded)', async () => {
    const { session } = setup();
    const rand = makePrng(0xfeed);
    const types = ['challenge_request', 'auth', 'sync_push', 'ping', 'pong', '', 'x'];
    const values: () => unknown = () => {
      const roll = rand();
      if (roll < 0.2) return Math.floor(rand() * 1e9);
      if (roll < 0.4) return 'str-' + Math.floor(rand() * 1e6).toString(36);
      if (roll < 0.55) return null;
      if (roll < 0.7) return [values(), values()];
      if (roll < 0.85) return { a: values(), b: values() };
      return rand() < 0.5;
    };

    for (let iter = 0; iter < 300; iter++) {
      const msg: WsMessage = { type: types[Math.floor(rand() * types.length)] };
      const fieldCount = Math.floor(rand() * 4);
      for (let i = 0; i < fieldCount; i++) {
        const keys = ['sourceId', 'response', 'protocolVersion', 'payload', 'encryptedPayload', 'token'];
        msg[keys[Math.floor(rand() * keys.length)]] = values();
      }
      await expect(session.onMessage(msg)).resolves.toBeUndefined();
    }
  });
});
