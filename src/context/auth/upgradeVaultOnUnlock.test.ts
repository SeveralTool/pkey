/**
 * @fileoverview Unlock upgrade must not re-run Argon2 when the session already exists.
 */

jest.mock('../../services/storage', () => ({
  writeDatabaseToDisk: jest.fn(async () => undefined),
}));

jest.mock('../../services/biometrics', () => ({
  persistUnlockCredentials: jest.fn(async () => undefined),
}));

jest.mock('../../services/unlockThrottle', () => ({
  recordUnlockSuccess: jest.fn(async () => undefined),
}));

jest.mock('../../services/nativeVault', () => ({
  establishSessionFromPassword: jest.fn(),
}));

jest.mock('../../services/deviceSecret', () => ({
  mixDeviceSecret: jest.fn(async () => null),
}));

import { encryptVaultV4, deriveAuthVerifier } from '@pkey/core';
import { LocalCipher } from '../../services/crypto';
import { writeDatabaseToDisk } from '../../services/storage';
import { establishSessionFromPassword } from '../../services/nativeVault';
import { persistUnlockCredentials } from '../../services/biometrics';
import { setSessionRootKey, clearSessionRootKey } from '../../services/sessionKey';
import { upgradeVaultOnUnlock } from './upgradeVaultOnUnlock';
import type { EncryptedDatabase } from '../../types';

const SALT = 'aabbccddeeff00112233445566778899';
const ROOT = 'ab'.repeat(32);
const PASS = 'ignored-when-session-exists';

function v4Db(): EncryptedDatabase {
  return {
    version: '1.0.0',
    creation_date: '2026-01-01',
    last_update: '2026-01-01',
    passwordHash: deriveAuthVerifier(ROOT),
    passwordHashScheme: 'v4-argon2',
    salt: SALT,
    sessionId: '11111111-1111-4111-8111-111111111111',
    settings: {},
    cards: [],
  };
}

describe('upgradeVaultOnUnlock', () => {
  beforeEach(() => {
    clearSessionRootKey();
    jest.mocked(establishSessionFromPassword).mockReset();
    jest.mocked(writeDatabaseToDisk).mockClear();
    jest.mocked(persistUnlockCredentials).mockClear();
  });

  afterEach(() => {
    clearSessionRootKey();
    jest.restoreAllMocks();
  });

  it('does not derive when v4 decrypt already set the session', async () => {
    setSessionRootKey(ROOT, SALT);
    const db = v4Db();
    const envelope = encryptVaultV4(JSON.stringify(db), ROOT, SALT);
    const deriveSpy = jest.spyOn(LocalCipher, 'deriveRootKey');
    const classifySpy = jest.spyOn(LocalCipher, 'classifyVaultForPassword');

    const out = await upgradeVaultOnUnlock(PASS, db, envelope);

    expect(out.passwordHashScheme).toBe('v4-argon2');
    expect(establishSessionFromPassword).not.toHaveBeenCalled();
    expect(deriveSpy).not.toHaveBeenCalled();
    expect(classifySpy).not.toHaveBeenCalled();
    expect(persistUnlockCredentials).toHaveBeenCalled();
    deriveSpy.mockRestore();
    classifySpy.mockRestore();
  });

  it('derives once via establishSessionFromPassword for legacy envelopes', async () => {
    jest.mocked(establishSessionFromPassword).mockImplementation(async (_pass, salt) => {
      setSessionRootKey(ROOT, salt);
      return { rootKeyHex: ROOT, authVerifier: deriveAuthVerifier(ROOT) };
    });
    const db = { ...v4Db(), passwordHashScheme: 'v3-hkdf' as const };
    const classifySpy = jest.spyOn(LocalCipher, 'classifyVaultForPassword');
    const deriveSpy = jest.spyOn(LocalCipher, 'deriveRootKey');
    const legacy = JSON.stringify({
      v: 3,
      kdfSalt: SALT,
      salt: '00'.repeat(16),
      iv: '11'.repeat(16),
      ciphertext: '22'.repeat(16),
      hmac: '33'.repeat(32),
      kdfIter: 600000,
    });
    await upgradeVaultOnUnlock(PASS, db, legacy);
    expect(establishSessionFromPassword).toHaveBeenCalledTimes(1);
    expect(classifySpy).not.toHaveBeenCalled();
    expect(deriveSpy).not.toHaveBeenCalled();
    classifySpy.mockRestore();
    deriveSpy.mockRestore();
  });
});
