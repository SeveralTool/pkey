/**
 * @fileoverview Platform autofill helpers (Android AutofillService bridge).
 *
 * Neither Android nor iOS allow an app to silently become the system password
 * provider — the OS always requires an explicit user choice. On Android we open
 * the system autofill picker; on iOS a Credential Provider extension is required
 * (not shipped yet).
 */
import { Linking, Platform } from 'react-native';
import {
  collectIdentities,
  hostsOf,
  androidPackagesOf,
  registrableDomain,
  type PasswordCard,
} from '@pkey/core';
import PkeyAutofill from 'pkey-autofill';

export type AutofillPlatformSupport = 'android' | 'ios_unavailable' | 'unsupported';

export const getAutofillPlatformSupport = (): AutofillPlatformSupport => {
  if (Platform.OS === 'android') {
    return PkeyAutofill != null ? 'android' : 'unsupported';
  }
  if (Platform.OS === 'ios') return 'ios_unavailable';
  return 'unsupported';
};

export const isAutofillNativeAvailable = (): boolean =>
  getAutofillPlatformSupport() === 'android';

/** Build cache payload for login cards only. */
export function buildAutofillCacheJson(cards: PasswordCard[]): string {
  const entries = cards
    .filter((c) => c?.id && c.type === 'PASSWORD')
    .map((c) => {
      const ids = collectIdentities(c.link || '', c.uris);
      const hostList = hostsOf(ids);
      const domains = [
        ...new Set(hostList.flatMap((h) => [h, registrableDomain(h)].filter(Boolean))),
      ];
      const packages = androidPackagesOf(ids);
      return {
        id: c.id,
        title: c.title || '',
        username: c.username || '',
        password: c.passwordList?.[0] || '',
        domains,
        packages,
      };
    });
  return JSON.stringify(entries);
}

export async function syncAutofillCache(cards: PasswordCard[]): Promise<void> {
  if (!PkeyAutofill) return;
  try {
    await PkeyAutofill.syncCache(buildAutofillCacheJson(cards));
  } catch {
    // Native optional — ignore
  }
}

export async function clearAutofillCache(): Promise<void> {
  if (!PkeyAutofill) return;
  try {
    await PkeyAutofill.clearCache();
  } catch {
    // ignore
  }
}

/** Opens the OS autofill / password settings UI (user must confirm). */
export async function openAutofillSettings(): Promise<void> {
  if (Platform.OS === 'android' && PkeyAutofill) {
    await PkeyAutofill.openAutofillSettings();
    return;
  }
  if (Platform.OS === 'ios') {
    await Linking.openSettings();
  }
}

/** Whether PKEY is currently the active Android Autofill service. */
export async function isAutofillServiceEnabled(): Promise<boolean> {
  if (!PkeyAutofill) return false;
  try {
    return !!(await PkeyAutofill.isServiceEnabled());
  } catch {
    return false;
  }
}
