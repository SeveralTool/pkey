/**
 * @fileoverview mDNS constants and URL helpers for web access.
 */

import { WEB_SYNC_PORT } from './syncWebServer';

export const WEB_SERVICE_TYPE = '_pkey-web';
export const WEB_SERVICE_PROTOCOL = 'tcp';
export const WEB_SERVICE_DOMAIN = 'local.';
export const WEB_INSTANCE_SUFFIX_LEN = 4;
export const WEB_DEVICE_NAME_MAX_LEN = 20;

export { WEB_SYNC_PORT };

/** Short unique suffix derived from the install device id. */
export function buildWebInstanceSuffix(deviceId: string): string {
  return deviceId.slice(0, WEB_INSTANCE_SUFFIX_LEN).toLowerCase();
}

/** Full mDNS instance name: `{baseName}-{suffix}`. */
export function buildWebInstanceName(baseName: string, deviceId: string): string {
  const base = baseName.slice(0, WEB_DEVICE_NAME_MAX_LEN);
  const suffix = buildWebInstanceSuffix(deviceId);
  if (!suffix) {
    throw new Error('deviceId required for mDNS instance name');
  }
  return `${base}-${suffix}`.toLowerCase();
}

/** Strips a trailing DNS root dot from an mDNS host. */
export function normalizeMdnsHost(host: string): string {
  return host.replace(/\.$/, '');
}

/** Normalize host for user-facing mDNS URLs (includes .local suffix). */
export function hostToMdnsUrlHostname(host: string): string {
  let h = normalizeMdnsHost(host).toLowerCase();
  if (!h.endsWith('.local')) {
    h = `${h}.local`;
  }
  return h;
}

/** Builds an `http://{host}.local:{port}` web-access URL. */
export function buildWebAccessUrl(host: string, port: number): string {
  return `http://${hostToMdnsUrlHostname(host)}:${port}`;
}

/** Builds a web-access URL from a full mDNS instance name. */
export function buildWebAccessUrlFromInstance(instanceName: string, port: number): string {
  return `http://${instanceName.toLowerCase()}.local:${port}`;
}

/**
 * Prefers the stable `.local` URL for copy/QR. The numeric LAN URL is only a
 * fallback when mDNS has not published (or the user says the name did not open).
 */
export function pickCanonicalWebAccessUrl(
  mdnsUrl: string | null | undefined,
  ipUrl: string | null | undefined
): string | null {
  const mdns = (mdnsUrl || '').trim();
  if (mdns) return mdns;
  const ip = (ipUrl || '').trim();
  return ip || null;
}
