/**
 * @fileoverview TLS SAN merge policy for device-migration certificates.
 *
 * IP changes must not rotate the persisted cert (trust pinning). Regeneration
 * is reserved for missing DNS names (new mDNS host).
 */

/** Extra SAN coverage requested by a TLS listener. */
export interface TlsSanInput {
  readonly dnsNames?: readonly string[];
  readonly ipAddresses?: readonly string[];
}

/** Canonical SAN set stored with the device cert. */
export interface StoredSans {
  readonly dnsNames: readonly string[];
  readonly ipAddresses: readonly string[];
}

/** Lowercase DNS, strip trailing dot. */
export function normalizeDns(name: string): string {
  return name.replace(/\.$/, '').toLowerCase();
}

/** Trim IPv4 text. */
export function normalizeIp(ip: string): string {
  return ip.trim();
}

/**
 * Merges extra SAN entries into a stored set. Invalid IPv4 strings are ignored.
 */
export function mergeSans(base: StoredSans, extra?: TlsSanInput): StoredSans {
  const dns = new Set(base.dnsNames.map(normalizeDns));
  const ips = new Set(base.ipAddresses.map(normalizeIp));
  for (const d of extra?.dnsNames ?? []) {
    const n = normalizeDns(d);
    if (n) dns.add(n);
  }
  for (const ip of extra?.ipAddresses ?? []) {
    const n = normalizeIp(ip);
    if (n && /^\d{1,3}(\.\d{1,3}){3}$/.test(n)) ips.add(n);
  }
  return {
    dnsNames: [...dns].sort(),
    ipAddresses: [...ips].sort(),
  };
}

/** True when `desired` includes a DNS name not present in `stored`. */
export function missingDns(stored: StoredSans, desired: StoredSans): boolean {
  return desired.dnsNames.some((d) => !stored.dnsNames.includes(d));
}

/** Default SAN set for a newly generated cert (CN + localhost + loopback). */
export function defaultSans(commonName: string): StoredSans {
  return mergeSans(
    { dnsNames: [normalizeDns(commonName), 'localhost'], ipAddresses: ['127.0.0.1'] },
    undefined
  );
}
