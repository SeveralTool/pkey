/**
 * @fileoverview Vault verifier / envelope upgrades that run once after a successful decrypt.
 * Must not Argon2 again when decrypt already established the session root.
 */
import { WordArray, Hex } from 'crypto-es';
import { deriveAuthVerifier, isEnvelopeV4 } from '@pkey/core';
import { LocalCipher } from '../../services/crypto';
import { writeDatabaseToDisk as writeDbService } from '../../services/storage';
import { persistUnlockCredentials } from '../../services/biometrics';
import { recordUnlockSuccess } from '../../services/unlockThrottle';
import {
  exportSessionRootKeyHex,
  getSessionKdfSalt,
  getSessionNativeHandle,
  hasSessionKeyMaterial,
  setSessionRootKey,
  whenSessionNativeAttached,
} from '../../services/sessionKey';
import { establishSessionFromPassword } from '../../services/nativeVault';
import {
  normalizeAppSettings,
  normalizeCards,
  ensureVaultSessionId,
} from '../../utils/appSettings';
import { mixDeviceSecret } from '../../services/deviceSecret';
import type { EncryptedDatabase } from '../../types';

function envelopeV4Params(
  encryptedPayload: string
): { t: number; m: number; p: number; deviceBound: boolean } | null {
  try {
    const env = JSON.parse(encryptedPayload.trim()) as unknown;
    if (!isEnvelopeV4(env)) return null;
    return {
      t: env.kdfTime,
      m: env.kdfMem,
      p: env.kdfPar,
      deviceBound: env.deviceBound === true,
    };
  } catch {
    return null;
  }
}

async function sessionAuthVerifier(): Promise<string> {
  const exported = await exportSessionRootKeyHex();
  if (!exported) {
    throw new Error('session-root-missing');
  }
  return deriveAuthVerifier(exported);
}

/**
 * Migrates legacy hashes, upgrades v2/v3 envelopes to v4, then persists biometric
 * material. Returns the in-memory vault ready for `setDb`.
 *
 * Classification uses the envelope header, not a second Argon2id.
 */
export async function upgradeVaultOnUnlock(
  pass: string,
  parsedDb: EncryptedDatabase,
  encryptedPayload: string
): Promise<EncryptedDatabase> {
  let workingDb = parsedDb;
  const v4params = envelopeV4Params(encryptedPayload);

  if (!workingDb.salt) {
    console.info('[Auth] Migrating unsalted vault to Argon2id envelope v4...');
    const newSalt = WordArray.random(16).toString(Hex);
    const { authVerifier } = await establishSessionFromPassword(pass, newSalt);
    workingDb = {
      ...workingDb,
      salt: newSalt,
      passwordHash: authVerifier,
      passwordHashScheme: 'v4-argon2',
    };
    await writeDbService(workingDb, pass);
  } else {
    const haveMaterial =
      hasSessionKeyMaterial() &&
      (getSessionKdfSalt() === workingDb.salt || Boolean(getSessionNativeHandle()));
    if (!haveMaterial) {
      await establishSessionFromPassword(
        pass,
        workingDb.salt,
        v4params ? { t: v4params.t, m: v4params.m, p: v4params.p } : undefined
      );
    }
    const needsV4 =
      !v4params ||
      workingDb.passwordHashScheme !== 'v4-argon2' ||
      LocalCipher.isLegacyEnvelope(encryptedPayload);
    if (needsV4) {
      console.info('[Auth] Upgrading vault to Argon2id envelope v4...');
      workingDb = {
        ...workingDb,
        passwordHash: await sessionAuthVerifier(),
        passwordHashScheme: 'v4-argon2',
      };
      await writeDbService(workingDb, pass);
    }
  }

  const withSession = ensureVaultSessionId(workingDb);
  if (withSession.sessionId !== workingDb.sessionId) {
    workingDb = withSession;
    await writeDbService(workingDb, pass);
  }

  const normalizedDb = {
    ...workingDb,
    settings: normalizeAppSettings(workingDb.settings, workingDb.cards),
    cards: normalizeCards(workingDb.cards),
  };

  const exported = await exportSessionRootKeyHex();
  if (!exported) {
    throw new Error('session-root-missing');
  }
  const alreadyMixed = v4params?.deviceBound === true;
  const boundRoot =
    normalizedDb.settings.bindDeviceSecret === true && !alreadyMixed
      ? await mixDeviceSecret(exported, 'PKEY')
      : exported;
  if (!boundRoot) {
    throw new Error('device-secret-required');
  }
  if (boundRoot !== exported) {
    setSessionRootKey(boundRoot, normalizedDb.salt!);
    await whenSessionNativeAttached();
  } else if (!getSessionNativeHandle()) {
    setSessionRootKey(boundRoot, normalizedDb.salt!);
  }
  await persistUnlockCredentials(boundRoot, normalizedDb.salt!, normalizedDb.passwordHash);
  await recordUnlockSuccess();
  return normalizedDb;
}
