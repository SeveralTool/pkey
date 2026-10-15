/**
 * @fileoverview TLS pin and retired pairing codes fail closed before a wipe POST.
 */

const mockWipe = {
  fingerprint: 'AB'.repeat(16) as string | null,
  connect: jest.fn(async (..._args: unknown[]) => undefined),
  post: jest.fn(async (..._args: unknown[]) => ({ status: 200, body: '', headers: {} })),
  close: jest.fn(),
};

jest.mock('./migrationTcpSession', () => ({
  MigrationTcpSession: class {
    get peerFingerprint(): string | null {
      return mockWipe.fingerprint;
    }
    connect(host: string, port: number): Promise<void> {
      return mockWipe.connect(host, port);
    }
    post(path: string, body: string, headers?: Record<string, string>): Promise<unknown> {
      return mockWipe.post(path, body, headers);
    }
    close(): void {
      mockWipe.close();
    }
  },
}));

import { encodeCrockfordBase32 } from './migrationChannelCrypto';
import { MigrationSendError } from './migrationErrors';
import { assertMigrationTlsPin, requestSenderWipe } from './migrationSender';

const PIN = 'AB'.repeat(16);
const PAIRING = encodeCrockfordBase32(new Uint8Array(15).fill(0x33));

describe('assertMigrationTlsPin', () => {
  it('accepts an observed fingerprint that matches the declaration', () => {
    expect(() => assertMigrationTlsPin(PIN, PIN.toLowerCase())).not.toThrow();
  });

  it('aborts when the socket did not expose a certificate', () => {
    expect(() => assertMigrationTlsPin(null, PIN)).toThrow(MigrationSendError);
    try {
      assertMigrationTlsPin(null, PIN);
    } catch (err) {
      expect(err).toBeInstanceOf(MigrationSendError);
      expect((err as MigrationSendError).detail).toContain('observed=missing');
    }
  });

  it('aborts when the declaration is missing or different', () => {
    expect(() => assertMigrationTlsPin(PIN, undefined)).toThrow(MigrationSendError);
    expect(() => assertMigrationTlsPin(PIN, 'CD'.repeat(16))).toThrow(MigrationSendError);
  });
});

describe('requestSenderWipe', () => {
  beforeEach(() => {
    mockWipe.fingerprint = PIN;
    mockWipe.connect.mockClear();
    mockWipe.post.mockClear();
    mockWipe.close.mockClear();
  });

  it('rejects a 16-char pairing secret before opening a socket', async () => {
    await expect(
      requestSenderWipe('10.0.0.2', 7394, 'mig', 'ABCDEF1234567890', 'sid', 'proof', PIN)
    ).resolves.toBe(false);
    expect(mockWipe.connect).not.toHaveBeenCalled();
  });

  it('does not post the wipe when the callback certificate was not observed', async () => {
    mockWipe.fingerprint = null;
    await expect(
      requestSenderWipe('10.0.0.2', 7394, 'mig', PAIRING, 'sid', 'proof', PIN)
    ).resolves.toBe(false);
    expect(mockWipe.connect).toHaveBeenCalledTimes(1);
    expect(mockWipe.post).not.toHaveBeenCalled();
    expect(mockWipe.close).toHaveBeenCalled();
  });
});
