import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import vaultKeys, { isPkeyVaultKeysAvailable } from 'pkey-vault-keys';
import { withExternalUiSession } from '../utils/autoLogoutGuard';
import { isUserCanceledAuth } from './deviceSecret';

/**
 * @fileoverview Biometric unlock credentials: hardware bundle first, SecureStore fallback.
 *
 * Storage model (post-audit C2 + A3):
 *
 *  - `pkey-vault-keys` when the binary has it and `detectCompromisedDevice()`
 *    is false: the bundle is AES-GCM wrapped by an Android Keystore key
 *    (BIOMETRIC_STRONG, invalidated on enrollment change) or an iOS Keychain
 *    item (`biometryCurrentSet`). **Android prompts on write too**
 *    (`UnlockKeystore.store` runs the cipher inside a `BiometricPrompt`
 *    `CryptoObject`); iOS `SecItemAdd` does not prompt. The missing prompt does
 *    not skip the ACL flag. Reads always prompt inside Keystore / Keychain.
 *    `isHardwareBacked()` on iOS is the label `"keychain"`, not a Secure
 *    Enclave measurement.
 *
 *  - A compromised device gets **no new bundle**. The write does not fall
 *    through to SecureStore. An existing hardware blob is left in place by
 *    {@link persistUnlockCredentials}; {@link replaceUnlockCredentials} still
 *    clears it, because the new root must not be stored without user-auth.
 *
 *  - `pkey_unlock_meta_v1`   → non-sensitive marker `{ hasBundle: true }`,
 *                              device-bound but readable without biometric.
 *                              Used by the login screen to decide whether the
 *                              biometric button should even be shown.
 *
 *  - `pkey_unlock_bundle_v2` → fallback only when the native module is missing
 *                              (Expo Go) or `storeUnlockBundle` fails for a
 *                              reason other than user cancel. Sensitive
 *                              `UnlockCredentials` JSON, `requireAuthentication:
 *                              false`. Any same-UID caller of `getItemAsync`
 *                              decrypts it without a `CryptoObject`. The
 *                              {@link authenticateBiometric} prompt on read is
 *                              not that gate, and an enrollment change does not
 *                              invalidate the item. Logout does not delete it;
 *                              reset and migration do ({@link destroyMasterKey}).
 *
 * The **master password is never persisted** — only the derived `rootKeyHex`,
 * KDF salt and auth hash live in the sensitive item. A dump of the SecureStore
 * fallback still cannot recover the master password, only the derived root.
 *
 * A one-shot migration from the legacy v1 bundle (which used
 * `requireAuthentication: false` and could hold a `masterPassword` field)
 * happens on first successful load: after peeking the legacy blob we re-write
 * it under the v2 key without the password, and delete the legacy entry.
 */

/** Marker item (device-bound, no OS auth). Presence == biometric unlock ready. */
const UNLOCK_META_ID = 'pkey_unlock_meta_v1';
/** Derived unlock credentials (device-bound; OS prompt is separate). */
const UNLOCK_BUNDLE_ID_V2 = 'pkey_unlock_bundle_v2';
/** Legacy pre-audit bundle (no OS auth, may include plaintext master password). */
const LEGACY_UNLOCK_BUNDLE_ID = 'pkey_unlock_bundle_v1';

const LEGACY_MASTER_KEY_ID = 'pkey_master_biometric';
const LEGACY_ROOT_KEY_ID = 'pkey_unlock_root_key';
const LEGACY_KDF_SALT_ID = 'pkey_unlock_kdf_salt';
const LEGACY_AUTH_HASH_ID = 'pkey_unlock_auth_hash';

/**
 * Device-bound, no biometric required. The OS prompt is {@link authenticateBiometric}
 * so a write-without-auth key cannot be read silently on Android.
 */
const DEVICE_BOUND: SecureStore.SecureStoreOptions = {
  requireAuthentication: false,
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** Credentials returned to callers after a successful biometric unlock. */
export interface UnlockCredentials {
  rootKeyHex: string;
  kdfSalt: string;
  authHash: string;
}

/**
 * Historic bundle shape. `masterPassword` is retained in the type for the
 * one-shot migration path but is stripped before re-persisting.
 * @deprecated Callers must consume {@link UnlockCredentials} instead.
 */
export interface UnlockBundle extends UnlockCredentials {
  /** @deprecated Never present in v2 bundles. Only appears when reading legacy blobs. */
  masterPassword?: string;
}

/** True when the device has biometric hardware and at least one enrolled credential. */
export const checkBiometrics = async (): Promise<boolean> => {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return compatible && enrolled;
};

/**
 * Prompts the OS biometric dialog (kept for callers that need a standalone
 * biometric check — e.g. before revealing an OTP secret or copying to clipboard).
 *
 * @returns `true` when authentication succeeds
 */
export const authenticateBiometric = async (
  promptMessage: string,
  fallbackLabel?: string
): Promise<boolean> => {
  return withExternalUiSession(async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel,
      disableDeviceFallback: true,
    });
    return result.success;
  });
};

function parseBundle(raw: string | null): UnlockCredentials | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<UnlockBundle>;
    if (parsed.rootKeyHex && parsed.kdfSalt && parsed.authHash) {
      return {
        rootKeyHex: parsed.rootKeyHex,
        kdfSalt: parsed.kdfSalt,
        authHash: parsed.authHash,
      };
    }
  } catch {
    /* invalid */
  }
  return null;
}

/**
 * Reads the non-sensitive meta marker. Used by the login screen to decide
 * whether to render the biometric unlock button. Never prompts the OS.
 */
async function readMeta(): Promise<{ hasBundle: boolean } | null> {
  try {
    const raw = await SecureStore.getItemAsync(UNLOCK_META_ID, DEVICE_BOUND);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { hasBundle?: boolean };
    if (parsed?.hasBundle === true) return { hasBundle: true };
    return null;
  } catch {
    return null;
  }
}

async function writeMeta(): Promise<void> {
  try {
    await SecureStore.setItemAsync(
      UNLOCK_META_ID,
      JSON.stringify({ hasBundle: true }),
      DEVICE_BOUND
    );
  } catch (e) {
    console.warn('[biometrics] writeMeta failed', e);
  }
}

async function readLegacyBundle(): Promise<UnlockCredentials | null> {
  // Try v1 (no auth) first.
  try {
    const raw = await SecureStore.getItemAsync(LEGACY_UNLOCK_BUNDLE_ID, DEVICE_BOUND);
    const parsed = parseBundle(raw);
    if (parsed) return parsed;
  } catch {
    /* legacy may be gone */
  }
  return null;
}

/**
 * Returns `true` when a biometric unlock bundle exists on this device.
 * Does NOT expose or return the credentials themselves. Safe to call from
 * boot / UI code that only needs to decide whether to show the biometric CTA.
 */
export const hasUnlockBundle = async (): Promise<boolean> => {
  if (isPkeyVaultKeysAvailable() && vaultKeys) {
    try {
      if (await vaultKeys.hasUnlockBundle()) return true;
    } catch {
      /* fall through to SecureStore meta */
    }
  }
  const meta = await readMeta();
  if (meta?.hasBundle) return true;
  // Fallback: legacy v1 bundle from pre-migration installs.
  const legacy = await readLegacyBundle();
  if (legacy) {
    // Write the meta marker so future peeks are cheap and don't touch legacy.
    await writeMeta();
    return true;
  }
  return false;
};

/**
 * @deprecated Kept for source-compat with callers that only need a boolean.
 * Returns a synthetic `{ hasBundle: true }` placeholder — no credentials.
 */
export const peekUnlockBundle = async (): Promise<{ hasBundle: true } | null> => {
  return (await hasUnlockBundle()) ? { hasBundle: true } : null;
};

/**
 * Biometric unlock. Always shows the native OS prompt first, then reads the
 * device-bound v2 item. SecureStore `requireAuthentication` is not used for
 * this key: it is written with {@link DEVICE_BOUND} after password login, and
 * on Android a later read with `requireAuthentication: true` does **not**
 * prompt (the Keystore key was not created with user-auth). That skipped the
 * dialog and unlocked the vault on the login auto-prompt.
 *
 * If the item does not exist yet but a legacy v1 bundle is present, the
 * legacy credentials are migrated to v2 (stripping any `masterPassword`
 * field) after the same biometric prompt.
 *
 * A canceled hardware prompt returns `null`. It does not continue into the
 * SecureStore fallback dialog: cancel means the user does not want to unlock.
 */
export const loadUnlockCredentials = async (
  prompt = 'Unlock PKEY'
): Promise<UnlockCredentials | null> => {
  if (isPkeyVaultKeysAvailable() && vaultKeys) {
    try {
      const nativeKeys = vaultKeys;
      const raw = await withExternalUiSession(() => nativeKeys.loadUnlockBundle(prompt));
      const parsed = parseBundle(raw);
      if (parsed) return parsed;
    } catch (e) {
      if (isUserCanceledAuth(e)) {
        console.warn('[biometrics] hardware unlock cancelled by the user');
        return null;
      }
      console.warn('[biometrics] native unlock read failed', e);
    }
  }

  const bioOk = await authenticateBiometric(prompt);
  if (!bioOk) return null;

  try {
    const raw = await SecureStore.getItemAsync(UNLOCK_BUNDLE_ID_V2, DEVICE_BOUND);
    const parsed = parseBundle(raw);
    if (parsed) return parsed;
  } catch (e) {
    console.warn('[biometrics] unlock read failed', e);
  }

  const legacy = await readLegacyBundle();
  if (!legacy) return null;

  await persistUnlockCredentials(legacy.rootKeyHex, legacy.kdfSalt, legacy.authHash);
  return legacy;
};

/**
 * @deprecated Use {@link loadUnlockCredentials} — the raw bundle no longer
 * carries a master password. Kept as a thin alias so older call sites keep
 * compiling while they are migrated.
 */
export const loadUnlockBundle = async (prompt = 'Unlock PKEY'): Promise<UnlockBundle | null> => {
  return await loadUnlockCredentials(prompt);
};

/**
 * @deprecated The master password is never persisted anymore. Always returns
 * `null`. Kept as a no-op for callers still importing it.
 */
export const retrieveMasterKey = async (_prompt: string): Promise<null> => {
  return null;
};

/** @deprecated Kept as no-op — unlock is handled by `persistUnlockCredentials`. */
export const storeMasterKey = async (_pass: string, _prompt: string): Promise<boolean> => true;

/**
 * Persists the derived unlock credentials after a successful password login.
 *
 * Prefers the hardware bundle (`pkey-vault-keys`). On Android that write shows
 * one BIOMETRIC_STRONG prompt (the Keystore key only works inside an
 * authenticated `CryptoObject`); on iOS `SecItemAdd` is silent and still sets
 * `biometryCurrentSet`. If the user cancels that prompt nothing is written and
 * `false` is returned — the vault stays unlocked, the next login simply asks
 * for the password again. A compromised device also returns `false` and does
 * not write SecureStore. Any other native failure, or a missing module, falls
 * back to the SecureStore item ({@link DEVICE_BOUND}, no OS auth on write).
 *
 * Reads are gated by the Keystore / Keychain prompt, or by
 * {@link authenticateBiometric} on the SecureStore fallback. A canceled
 * hardware read returns `null` and does not open that fallback.
 *
 * The optional legacy `password` parameter is accepted only for source
 * compatibility; it is ignored and never written to disk.
 *
 * @returns `true` when a bundle (hardware or fallback) is on disk afterwards.
 */
export const persistUnlockCredentials = async (
  rootKeyHex: string,
  kdfSalt: string,
  authHash: string,
  _legacyPasswordIgnored?: string,
  prompt = 'Unlock PKEY'
): Promise<boolean> => {
  const credentials: UnlockCredentials = { rootKeyHex, kdfSalt, authHash };
  if (isPkeyVaultKeysAvailable() && vaultKeys) {
    try {
      const compromised = await vaultKeys.detectCompromisedDevice();
      if (compromised.compromised) {
        console.warn('[biometrics] refusing unlock bundle on compromised device');
        return false;
      }
      await vaultKeys.storeUnlockBundle(JSON.stringify(credentials), prompt);
      await writeMeta();
      await clearLegacyUnlockKeys();
      await SecureStore.deleteItemAsync(UNLOCK_BUNDLE_ID_V2).catch(() => {});
      return true;
    } catch (e) {
      if (isUserCanceledAuth(e)) {
        console.warn('[biometrics] hardware bundle write cancelled by the user');
        return false;
      }
      console.warn('[biometrics] hardware bundle write failed; using SecureStore fallback', e);
    }
  }
  try {
    await persistUnlockCredentialsToSecureStore(credentials);
    return true;
  } catch (e) {
    console.warn('[biometrics] persistUnlockCredentials failed', e);
    return false;
  }
};

/**
 * Rewrites the biometric unlock bundle to the current session root. Used after
 * binding or unbinding the device secret so the next fingerprint login still
 * decrypts (the stored bundle would otherwise keep the previous root).
 *
 * Same storage preference as {@link persistUnlockCredentials}: hardware first,
 * SecureStore only when the module is missing or the hardware write fails.
 * A compromised device and a canceled Android prompt both leave no bundle, so
 * the login screen asks for the password instead of a fingerprint button that
 * cannot unlock.
 */
export async function replaceUnlockCredentials(
  rootKeyHex: string,
  kdfSalt: string,
  authHash: string,
  prompt = 'Unlock PKEY'
): Promise<void> {
  if (isPkeyVaultKeysAvailable() && vaultKeys) {
    await vaultKeys.clearUnlockBundle().catch(() => {});
  }
  const persisted = await persistUnlockCredentials(
    rootKeyHex,
    kdfSalt,
    authHash,
    undefined,
    prompt
  );
  if (!persisted) {
    await clearUnlockCredentials();
  }
}

async function persistUnlockCredentialsToSecureStore(
  credentials: UnlockCredentials
): Promise<void> {
  await SecureStore.setItemAsync(UNLOCK_BUNDLE_ID_V2, JSON.stringify(credentials), DEVICE_BOUND);
  await writeMeta();
  await clearLegacyUnlockKeys();
}

async function clearLegacyUnlockKeys(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(LEGACY_UNLOCK_BUNDLE_ID).catch(() => {}),
    SecureStore.deleteItemAsync(LEGACY_MASTER_KEY_ID).catch(() => {}),
    SecureStore.deleteItemAsync(LEGACY_ROOT_KEY_ID).catch(() => {}),
    SecureStore.deleteItemAsync(LEGACY_KDF_SALT_ID).catch(() => {}),
    SecureStore.deleteItemAsync(LEGACY_AUTH_HASH_ID).catch(() => {}),
  ]).catch(() => {});
}

/** Removes both the meta marker and the sensitive v2 bundle (plus legacy keys). */
export const clearUnlockCredentials = async (): Promise<void> => {
  if (isPkeyVaultKeysAvailable() && vaultKeys) {
    await vaultKeys.clearUnlockBundle().catch(() => {});
  }
  await SecureStore.deleteItemAsync(UNLOCK_META_ID).catch(() => {});
  await SecureStore.deleteItemAsync(UNLOCK_BUNDLE_ID_V2).catch(() => {});
  await clearLegacyUnlockKeys();
};

/**
 * Alias for {@link clearUnlockCredentials} used by reset and migration wipe.
 * Logout does not call this: the bundle has to survive so the next biometric
 * login can read it.
 */
export const destroyMasterKey = async (): Promise<void> => {
  await clearUnlockCredentials();
};
