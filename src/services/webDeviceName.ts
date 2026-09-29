/**
 * @fileoverview Platform default base name for the web-access mDNS instance.
 *
 * The device name is no longer user-configurable: the mDNS instance uses a
 * fixed, sanitized base derived from the platform model. This removes a
 * manual input surface (and any risk of malformed/long/colliding names)
 * while keeping a stable .local URL for the web browser.
 */

import { getDefaultDeviceName } from './deviceName';

/** Default web device name derived from the platform device model. */
export function getDefaultWebDeviceName(): string {
  return sanitizeWebDeviceName(getDefaultDeviceName());
}

/** Normalizes a name to a safe mDNS-friendly slug. */
function sanitizeWebDeviceName(raw: string): string {
  let name = raw
    .trim()
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-');
  name = name.replace(/^-+|-+$/g, '');
  return name || 'pkey';
}
