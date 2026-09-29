import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import vaultKeys, { isPkeyVaultKeysAvailable } from 'pkey-vault-keys';
import { withExternalUiSession } from '../utils/autoLogoutGuard';

/**
 * @fileoverview Biometric unlock credentials in SecureStore.
 *
 * Storage model (post-audit C2 + A3):
 *
 *  - `pkey_unlock_meta_v1`   → non-sensitive marker `{ hasBundle: true }`,
 *                              device-bound but readable without biometric.
 *                              Used by the login screen to decide whether the
 *                              biometric button should even be shown.
 *
 *  - `pkey_unlock_bundle_v2` → sensitive `UnlockCredentials` JSON, device-bound.
 *                              Written without OS auth (the user already proved
 *                              the master password). Reads go through
 *                              {@link authenticateBiometric} first so every
 *                              biometric unlock shows Face ID / fingerprint.
 *
 * The **master password is never persisted** — only the derived `rootKeyHex`,
 * KDF salt and auth hash live in the sensitive item. This keeps the invariant
 * "your plaintext master password never touches disk" intact even on a
 * compromised (rooted, ADB-connected) device: an attacker who dumps the
 * SecureStore blob still cannot recover the master password itself, only the
 * derived root key (which is what the vault actually uses for encryption).
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
 * Write deliberately uses {@link DEVICE_BOUND} (no biometric prompt): the user
 * already proved the master password. Requiring OS auth on *write* forced a
 * second Face ID / fingerprint dialog after every password login, including
 * when the user intentionally chose the password path (dirty fingers, etc.).
 *
 * Reads are gated by {@link authenticateBiometric} in {@link loadUnlockCredentials}
 * so the login auto-prompt and the fingerprint button always show the OS dialog.
 *
 * The optional legacy `password` / `_prompt` parameters are accepted only for
 * source compatibility; they are ignored and never written to disk.
 */
export const persistUnlockCredentials = async (
  rootKeyHex: string,
  kdfSalt: string,
  authHash: string,
  _legacyPasswordIgnored?: string,
  _prompt = 'Unlock PKEY'
): Promise<void> => {
  const credentials: UnlockCredentials = { rootKeyHex, kdfSalt, authHash };
  try {
    if (isPkeyVaultKeysAvailable() && vaultKeys) {
      const compromised = await vaultKeys.detectCompromisedDevice();
      if (!compromised.compromised) {
        await vaultKeys.storeUnlockBundle(JSON.stringify(credentials), _prompt);
        await writeMeta();
        await clearLegacyUnlockKeys();
        await SecureStore.deleteItemAsync(UNLOCK_BUNDLE_ID_V2).catch(() => {});
        return;
      }
      console.warn('[biometrics] skipping hardware bundle on compromised device');
    }
    await persistUnlockCredentialsToSecureStore(credentials);
  } catch (e) {
    console.warn('[biometrics] persistUnlockCredentials failed', e);
  }
};

/**
 * Rewrites the biometric unlock blob to the current session root without a
 * Keystore prompt. Used after binding or unbinding the device secret so the
 * next fingerprint login still decrypts (the hardware unlock blob would
 * otherwise keep the previous root and fail fast-unlock).
 */
export async function replaceUnlockCredentials(
  rootKeyHex: string,
  kdfSalt: string,
  authHash: string
): Promise<void> {
  const credentials: UnlockCredentials = { rootKeyHex, kdfSalt, authHash };
  if (isPkeyVaultKeysAvailable() && vaultKeys) {
    await vaultKeys.clearUnlockBundle().catch(() => {});
  }
  try {
    await persistUnlockCredentialsToSecureStore(credentials);
  } catch (e) {
    console.warn('[biometrics] replaceUnlockCredentials failed', e);
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

/** Alias for {@link clearUnlockCredentials} used by logout / wipe flows. */
export const destroyMasterKey = async (): Promise<void> => {
  await clearUnlockCredentials();
};
