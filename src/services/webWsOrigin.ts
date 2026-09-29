/** Allow Origin for LAN PWA WebSocket upgrades. */

/** True for RFC1918 / localhost-style hostnames. */
export function isPrivateHostname(host: string): boolean {
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  return false;
}

/**
 * Allow Origin for LAN PWA: missing Origin OK; otherwise private/local/same host.
 */
export function isAllowedWsOrigin(
  origin: string | undefined,
  hostHeader: string | undefined
): boolean {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    const hostname = u.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
    if (hostname.endsWith('.local')) return true;
    if (isPrivateHostname(hostname)) return true;
    if (hostHeader) {
      const hostOnly = hostHeader.split(':')[0]!.toLowerCase();
      if (hostname === hostOnly) return true;
    }
    return false;
  } catch {
    return false;
  }
}
