/**
 * @fileoverview Have I Been Pwned (HIBP) password breach lookup via
 * k-anonymity, per audit finding B5.
 *
 * WHY THIS EXISTS
 * ---------------
 * Users want to know if a stored password appears in a public breach so
 * they can rotate it. Naively sending "does this password appear in a
 * breach?" leaks the password itself. HIBP solves this with the "range"
 * API:
 *
 *   1. Compute SHA-1 of the password. (SHA-1 is intentional here — HIBP's
 *      API is keyed on SHA-1 for backwards compatibility. This is a HASH
 *      of a PASSWORD, NOT auth material; collision weaknesses of SHA-1 do
 *      not matter for this use case.)
 *   2. Send ONLY the first 5 hex chars (the "prefix") to
 *      `https://api.pwnedpasswords.com/range/{prefix}`.
 *   3. The response is a newline-separated list of `SUFFIX:COUNT` for
 *      every known hash sharing the prefix (typically ~500 entries).
 *   4. Locally, search for the remaining 35-char suffix; the count if
 *      found is the number of times the password appears in known
 *      breaches.
 *
 * The server learns only the 5-char prefix (~2^20 anonymity set).
 *
 * OPT-IN
 * ------
 * Even though the query is anonymised, ANY network egress is opt-in in
 * PKey — users who bought into the local-first promise should not have
 * their app silently talking to a third-party API without consent. The
 * setting lives at `settings.enableHibpCheck` and defaults to `false`.
 *
 * TIMEOUTS + FAILURE MODE
 * -----------------------
 * The API can be slow or unreachable on hostile networks. All calls have
 * a hard 4 s timeout via `AbortController`, and errors are swallowed into
 * a `{ status: 'error' }` return so callers can differentiate:
 *   - `{ status: 'clean' }`      – definitively not in any known breach
 *   - `{ status: 'breached', count } – found N times
 *   - `{ status: 'error' }`      – network / timeout / disabled
 */
import { sha1Bytes } from '../utils/sha1';

const HIBP_ENDPOINT = 'https://api.pwnedpasswords.com/range/';
const HIBP_TIMEOUT_MS = 4_000;

export type HibpResult =
  { status: 'clean' } | { status: 'breached'; count: number } | { status: 'error'; reason: string };

const bytesToHexUpper = (bytes: Uint8Array): string => {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out.toUpperCase();
};

/**
 * Checks a plaintext password against the HIBP range API using k-anonymity.
 * Never sends the password itself — only the first 5 hex chars of its
 * SHA-1 hash are transmitted.
 *
 * @param password - The plaintext password to check.
 * @param opts.fetchImpl - Injected `fetch` for tests. Defaults to global.
 * @param opts.timeoutMs - Override the network timeout.
 */
export async function checkPasswordAgainstHibp(
  password: string,
  opts: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {}
): Promise<HibpResult> {
  if (!password) return { status: 'error', reason: 'empty-password' };

  const hashBytes = sha1Bytes(password);
  const hex = bytesToHexUpper(hashBytes);
  const prefix = hex.slice(0, 5);
  const suffix = hex.slice(5);

  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? HIBP_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Chain caller-provided signal so an outer abort cascades.
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const fetchImpl = opts.fetchImpl ?? fetch;
    const res = await fetchImpl(`${HIBP_ENDPOINT}${prefix}`, {
      method: 'GET',
      signal: controller.signal,
      // Explicitly ask HIBP for the padded response format so all entries
      // are padded with fake ones — this thwarts response-size analysis.
      headers: { 'Add-Padding': 'true' },
    });

    if (!res.ok) {
      return { status: 'error', reason: `http-${res.status}` };
    }

    const body = await res.text();
    // Response is CRLF-separated `SUFFIX:COUNT` lines. Some entries have
    // count=0 (padding); a real match has count>0.
    const upper = body.toUpperCase();
    for (const line of upper.split(/\r?\n/)) {
      const [lineSuffix, countRaw] = line.split(':');
      if (lineSuffix !== suffix) continue;
      const count = parseInt(countRaw ?? '0', 10);
      if (Number.isFinite(count) && count > 0) {
        return { status: 'breached', count };
      }
      return { status: 'clean' };
    }
    return { status: 'clean' };
  } catch (err: unknown) {
    const reason =
      err instanceof Error
        ? err.name === 'AbortError'
          ? 'timeout'
          : err.message.slice(0, 80)
        : 'unknown';
    return { status: 'error', reason };
  } finally {
    clearTimeout(timer);
  }
}
