/**
 * @fileoverview Adaptive reconnect candidates for the PWA after a DHCP IP
 * change, plus the WebSocket probe that validates a candidate host.
 *
 * The page origin NEVER changes (no redirect): data in IndexedDB
 * (`offlineVault`) and localStorage (`outbox`) is origin-scoped, so recovery
 * only rotates the WebSocket target host.
 *
 * Probing happens over the sync protocol itself — no HTTP endpoint, no CORS —
 * and a candidate only counts as found when it proves it holds the host
 * pairing secret (see `masterProof.ts`). A rogue LAN host answering on the
 * port fails the proof and never receives password-derived material.
 */
import { getSecureRandomHex } from '@pkey/core';
import { type ServerIdentity, isIpv4Host } from './serverIdentity';

/** Timeout per candidate probe (mDNS resolution is slower, especially Windows/Chrome). */
export const MDNS_TIMEOUT_MS = 5000;
export const IP_TIMEOUT_MS = 1500;
/** A success older than this means the server likely moved to a new IP. */
export const RECENT_SUCCESS_MS = 60_000;

export type CandidateKind = 'mdns' | 'ip' | 'sweep';

export interface ServerCandidate {
  /** `host[:port]` to probe, or '' for the synthetic sweep marker. */
  host: string;
  kind: CandidateKind;
  timeoutMs: number;
}

/**
 * Orders the alternative hosts to probe after the current host fails:
 * - `mdns` first (stable name that resolves to the NEW ip) when the page was
 *   loaded via an IP;
 * - the last-known `ip` next (home DHCP often re-issues the same address);
 * - the subnet sweep as the last-resort marker.
 *
 * The current host is intentionally excluded: it is already covered by the
 * normal retry cycle, and probing it adds noise (the direct-reconnect fast path
 * handles a microcut without any probe).
 *
 * @param identity - Known master identity (may be null → no candidates).
 * @param currentHost - `host[:port]` the socket currently targets.
 * @param port - Protocol port (7392) appended to bare hosts.
 */
export function buildCandidates(
  identity: ServerIdentity | null,
  currentHost: string,
  port: string
): ServerCandidate[] {
  const out: ServerCandidate[] = [];
  if (!identity) return out;
  const current = (currentHost || '').toLowerCase();
  const seen = new Set<string>();
  const push = (host: string, kind: CandidateKind) => {
    if (!host) return;
    const h = host.includes(':') ? host.toLowerCase() : `${host}:${port}`.toLowerCase();
    if (h === current) return;
    if (seen.has(h)) return;
    seen.add(h);
    out.push({
      host: h,
      kind,
      timeoutMs: kind === 'mdns' ? MDNS_TIMEOUT_MS : IP_TIMEOUT_MS,
    });
  };
  // When the page was loaded via the stable .local hostname, the mDNS host is
  // the current host itself (dedup removes it) — only the last IP helps.
  push(identity.mdnsHost, 'mdns');
  push(identity.ip, 'ip');
  out.push({ host: '', kind: 'sweep', timeoutMs: 0 });
  return out;
}

/** True when the page should reconnect directly to `current` (no probing). */
export function shouldReconnectDirect(
  identity: ServerIdentity | null,
  currentHost: string,
  now = Date.now()
): boolean {
  if (!identity) return false;
  // Microcut: server alive, socket died — reconnect immediately, zero noise.
  if (now - identity.lastSuccessAt < RECENT_SUCCESS_MS) return true;
  // Stable hostname (e.g. .local): the address itself cannot change, only the
  // socket state can — reconnect directly before probing alternatives.
  if (!isIpv4Host((currentHost || '').split(':')[0] ?? '')) return true;
  return false;
}

/** Fields of a `challenge` message a probe needs to judge the peer. */
export interface ProbeChallenge {
  salt: unknown;
  serverProof: unknown;
}

/**
 * Verifies that a `challenge` came from the master this browser knows.
 * Supplied by the app store, which holds the pinned salt and the session hash.
 */
export type ProbeVerifier = (challenge: ProbeChallenge, clientNonce: string) => boolean;

/** Builds `ws://host/pkey/ws` for a probe (mirrors the app store's scheme rule). */
function probeUrl(host: string): string {
  const scheme = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${host}/pkey/ws`;
}

/**
 * Opens a throwaway WebSocket to `host` and resolves true only when the peer
 * answers with a `challenge` that passes `verify`.
 *
 * Nothing derived from the master password is ever sent: the probe only asks
 * for a challenge, using a random source id so it neither consumes the real
 * session's pending challenge nor pollutes the master's per-source rate limit.
 *
 * @param host - Candidate `host[:port]`.
 * @param timeoutMs - Hard deadline for the whole probe.
 * @param verify - Proof/salt check for the received challenge.
 */
export function probeWs(host: string, timeoutMs: number, verify: ProbeVerifier): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (!host || typeof WebSocket === 'undefined') {
      resolve(false);
      return;
    }
    let socket: WebSocket;
    try {
      socket = new WebSocket(probeUrl(host));
    } catch {
      resolve(false);
      return;
    }

    const clientNonce = getSecureRandomHex(16);
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);

    socket.onopen = () => {
      try {
        socket.send(
          JSON.stringify({
            type: 'challenge_request',
            sourceId: `probe-${getSecureRandomHex(8)}`,
            clientNonce,
          })
        );
      } catch {
        finish(false);
      }
    };
    socket.onmessage = (e: MessageEvent) => {
      let msg: { type?: unknown; salt?: unknown; serverProof?: unknown };
      try {
        msg = JSON.parse(String(e.data)) as typeof msg;
      } catch {
        finish(false);
        return;
      }
      if (msg.type !== 'challenge') {
        // `error` (rate limited / blocked) or anything unexpected: not usable.
        finish(false);
        return;
      }
      finish(verify({ salt: msg.salt, serverProof: msg.serverProof }, clientNonce));
    };
    socket.onerror = () => finish(false);
    socket.onclose = () => finish(false);
  });
}
