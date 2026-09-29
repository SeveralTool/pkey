/**
 * @fileoverview Subnet sweep: probes every other host in the /24 of the last
 * known master IP over the sync WebSocket (same port). This is the last-resort
 * discovery after mDNS and the stale IP fail.
 *
 * Guards (each independently aborts the sweep):
 * - tab must be visible (`document.visibilityState === 'visible'`),
 * - the browser must report `navigator.onLine`,
 * - global cooldown between sweeps (5 min, persisted in localStorage),
 * - cross-tab lock (10 s TTL) so two tabs never sweep simultaneously; the
 *   tab that finds the master publishes `@pkey/sweep-found` so sibling tabs
 *   can reconnect too without sweeping. localStorage has no atomic
 *   compare-and-set, so the lock is advisory: the worst case is two tabs
 *   sweeping once.
 */
import { type ServerIdentity, isIpv4Host } from './serverIdentity';
import { type ProbeVerifier, probeWs } from './discovery';

/** localStorage keys (shared across tabs of the same origin). */
export const LK_SWEEP_LOCK = '@pkey/sweep-lock';
export const LK_SWEEP_LAST_RUN = '@pkey/sweep-last-run';
export const LK_SWEEP_FOUND = '@pkey/sweep-found';

/** Lock TTL: a crashed tab must not block sweeping forever. */
export const SWEEP_LOCK_TTL_MS = 10_000;
/** Minimum time between sweeps (LAN noise guard). */
export const SWEEP_COOLDOWN_MS = 5 * 60_000;
/** Parallel probes (LAN-friendliness). */
export const SWEEP_CONCURRENCY = 16;
/** Per-host probe deadline. */
export const SWEEP_TIMEOUT_MS = 1500;
/** Wall-clock cap for a whole /24 sweep (avoids a long hang on a dead LAN). */
export const SWEEP_DEADLINE_MS = 8_000;

export interface SweepResult {
  /** `ip:port` of the master, or null when nothing responded. */
  foundHost: string | null;
  /** Number of hosts actually probed. */
  probed: number;
}

export interface SweepOptions {
  /** Last known master IPv4 (defines the /24 and is skipped as self). */
  baseIp: string;
  /** Proof/salt check applied to every probed host. */
  verify: ProbeVerifier;
  /** Extra `host[:port]` already probed by the caller (skipped). */
  excludeHosts?: string[];
  port?: string;
  concurrency?: number;
  timeoutMs?: number;
  /** Abort the sweep after this many ms (default {@link SWEEP_DEADLINE_MS}). */
  deadlineMs?: number;
}

function parseSweepLock(raw: string | null): number {
  if (!raw) return 0;
  try {
    const p = JSON.parse(raw) as { at?: unknown };
    return typeof p.at === 'number' ? p.at : 0;
  } catch {
    return 0;
  }
}

/** True when another tab currently holds a live sweep lock. */
export function hasActiveSweepLock(now = Date.now()): boolean {
  if (typeof localStorage === 'undefined') return false;
  const at = parseSweepLock(localStorage.getItem(LK_SWEEP_LOCK));
  return at > 0 && now - at < SWEEP_LOCK_TTL_MS;
}

/** Acquires the cross-tab sweep lock. Returns false when a live lock exists. */
export function acquireSweepLock(now = Date.now()): boolean {
  if (typeof localStorage === 'undefined') return true;
  if (hasActiveSweepLock(now)) return false;
  try {
    localStorage.setItem(LK_SWEEP_LOCK, JSON.stringify({ at: now }));
    return true;
  } catch {
    return true; // storage unavailable — proceed without cross-tab coordination
  }
}

/** Releases the cross-tab sweep lock (only if this tab still holds it). */
export function releaseSweepLock(now = Date.now()): void {
  if (typeof localStorage === 'undefined') return;
  const at = parseSweepLock(localStorage.getItem(LK_SWEEP_LOCK));
  if (at === 0) return;
  if (now - at < SWEEP_LOCK_TTL_MS && at !== now) return; // someone else's lock
  try {
    localStorage.removeItem(LK_SWEEP_LOCK);
  } catch {
    /* ignore */
  }
}

/** Publishes a found host for sibling tabs (same origin → same identity). */
export function publishSweepFound(ip: string, deviceId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LK_SWEEP_FOUND, JSON.stringify({ ip, deviceId, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

/** Reads a previously published sweep result ('' when absent/stale). */
export function readSweepFound(deviceId: string, maxAgeMs = 30_000): string {
  if (typeof localStorage === 'undefined') return '';
  try {
    const raw = localStorage.getItem(LK_SWEEP_FOUND);
    if (!raw) return '';
    const p = JSON.parse(raw) as { ip?: unknown; deviceId?: unknown; at?: unknown };
    if (typeof p.ip !== 'string' || !isIpv4Host(p.ip)) return '';
    if (p.deviceId !== deviceId) return '';
    if (typeof p.at !== 'number' || Date.now() - p.at > maxAgeMs) return '';
    return p.ip;
  } catch {
    return '';
  }
}

/** External guards: visible tab + online browser. */
export function sweepGuardsOk(): boolean {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return false;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  return true;
}

/**
 * True for RFC1918 IPv4 (10/8, 172.16–31/12, 192.168/16). Public and
 * link-local addresses are never swept.
 */
export function isRfc1918Ipv4(ip: string): boolean {
  const m = (ip || '').match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3]);
  const d = Number(m[4]);
  if ([a, b, c, d].some((o) => o > 255)) return false;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/**
 * Addresses the PWA may walk in a /24: home LAN plus loopback (e2e / local mock).
 * Public, CGNAT, and link-local ranges stay out.
 */
export function isSweepableIpv4(ip: string): boolean {
  const m = (ip || '').match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  if (a === 127) {
    const octets = m.slice(1).map(Number);
    return octets.every((o) => o <= 255);
  }
  return isRfc1918Ipv4(ip);
}

/**
 * Probes every other host in the /24 of `baseIp` (concurrency-bounded,
 * abort-on-found). Never throws: failures just count as probed hosts.
 */
export async function runSweep(opts: SweepOptions): Promise<SweepResult> {
  const m = (opts.baseIp || '').match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return { foundHost: null, probed: 0 };
  const octets = m.slice(1).map(Number);
  if (octets.some((o) => o > 255)) return { foundHost: null, probed: 0 };
  const selfHost = `${octets[0]}.${octets[1]}.${octets[2]}.${octets[3]}`;
  if (!isSweepableIpv4(selfHost)) return { foundHost: null, probed: 0 };
  const excluded = new Set(
    (opts.excludeHosts ?? [])
      .map((h) => (h || '').split(':')[0] ?? '')
      .filter(Boolean)
      .map((h) => h.toLowerCase())
  );
  const hosts: string[] = [];
  for (let i = 1; i <= 254; i++) {
    if (i === octets[3]) continue; // self
    const ip = `${octets[0]}.${octets[1]}.${octets[2]}.${i}`;
    if (excluded.has(ip)) continue;
    hosts.push(ip);
  }
  if (hosts.length === 0) return { foundHost: null, probed: 0 };

  const port = opts.port ?? '';
  const concurrency = Math.min(opts.concurrency ?? SWEEP_CONCURRENCY, hosts.length);
  const timeoutMs = opts.timeoutMs ?? SWEEP_TIMEOUT_MS;
  const deadlineAt = Date.now() + (opts.deadlineMs ?? SWEEP_DEADLINE_MS);
  const portSuffix = port ? `:${port}` : '';

  let nextIdx = 0;
  let probed = 0;
  let found: string | null = null;

  const worker = async (): Promise<void> => {
    while (found === null) {
      if (Date.now() >= deadlineAt) return;
      const idx = nextIdx++;
      if (idx >= hosts.length) return;
      const ip = hosts[idx];
      probed++;
      const ok = await probeWs(`${ip}${portSuffix}`, timeoutMs, opts.verify);
      if (ok) found = ip;
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return { foundHost: found ? `${found}${portSuffix}` : null, probed };
}

/**
 * Guarded sweep entry point used by the app store: checks visibility/online,
 * the cooldown, and the cross-tab lock; publishes the result for sibling tabs.
 * Returns null when the sweep was skipped by a guard.
 */
export async function tryRunSweep(
  identity: ServerIdentity,
  opts: Partial<Omit<SweepOptions, 'verify'>> & { verify: ProbeVerifier }
): Promise<SweepResult | null> {
  const { baseIp, ...rest } = opts;
  if (!baseIp || !isIpv4Host(baseIp) || !isSweepableIpv4(baseIp)) return null;
  if (!sweepGuardsOk()) return null;

  // Global cooldown (per-origin, shared across tabs).
  if (typeof localStorage !== 'undefined') {
    const last = Number(localStorage.getItem(LK_SWEEP_LAST_RUN) || 0);
    if (last > 0 && Date.now() - last < SWEEP_COOLDOWN_MS) return null;
    try {
      localStorage.setItem(LK_SWEEP_LAST_RUN, String(Date.now()));
    } catch {
      /* ignore */
    }
  }

  const lockAt = Date.now();
  if (!acquireSweepLock(lockAt)) {
    // Another tab is sweeping; wait for its result instead of duplicating noise.
    const siblingFound = readSweepFound(identity.deviceId);
    return siblingFound
      ? { foundHost: `${siblingFound}${rest.port ? `:${rest.port}` : ''}`, probed: 0 }
      : null;
  }
  try {
    const result = await runSweep({ baseIp, ...rest });
    if (result.foundHost) {
      const ipOnly = result.foundHost.split(':')[0] ?? '';
      if (ipOnly) publishSweepFound(ipOnly, identity.deviceId);
    }
    return result;
  } finally {
    releaseSweepLock(lockAt);
  }
}
