/**
 * @fileoverview Random host-pairing secret for pre-auth LAN discovery proofs.
 *
 * Distinct from the vault auth verifier: an HMAC under this key is not an
 * offline master-password oracle. Rotates when the vault salt (generation)
 * changes; survives Web Access on/off.
 */
import * as SecureStore from 'expo-secure-store';
import {
  generateHostProofSecret,
  isHostProofSecretHex,
  normalizeHostProofSecret,
} from '@pkey/core';

/** SecureStore key for the JSON `{ secret, vaultSalt }` blob. */
export const SK_HOST_PROOF_SECRET = 'pkey_host_proof_secret_v1';

const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

interface StoredHostProof {
  secret: string;
  vaultSalt: string;
}

function parseStored(raw: string | null): StoredHostProof | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const rec = parsed as { secret?: unknown; vaultSalt?: unknown };
    const secret = normalizeHostProofSecret(rec.secret);
    if (!secret || typeof rec.vaultSalt !== 'string' || rec.vaultSalt.length === 0) return null;
    return { secret, vaultSalt: rec.vaultSalt };
  } catch {
    return null;
  }
}

async function persist(record: StoredHostProof): Promise<void> {
  await SecureStore.setItemAsync(SK_HOST_PROOF_SECRET, JSON.stringify(record), STORE_OPTIONS);
}

/**
 * Returns the pairing secret for this vault generation, creating one if needed.
 * A different `vaultSalt` rotates the secret so a new session cannot reuse the
 * previous pairing.
 *
 * @param vaultSalt - Current vault salt (`EncryptedDatabase.salt`).
 */
export async function getOrCreateHostProofSecret(vaultSalt: string): Promise<string> {
  const salt = vaultSalt.trim();
  if (!salt) {
    const secret = generateHostProofSecret();
    return secret;
  }
  try {
    const stored = parseStored(await SecureStore.getItemAsync(SK_HOST_PROOF_SECRET, STORE_OPTIONS));
    if (stored && stored.vaultSalt === salt && isHostProofSecretHex(stored.secret)) {
      return stored.secret;
    }
    const secret = generateHostProofSecret();
    await persist({ secret, vaultSalt: salt });
    return secret;
  } catch {
    return generateHostProofSecret();
  }
}
