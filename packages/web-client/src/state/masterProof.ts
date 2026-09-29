/**
 * @fileoverview Verifies that a master reached at a *rotated* host is the same
 * master this browser already paired with, before any password-derived material
 * is sent to it.
 *
 * Why this exists: on reconnect the PWA answers the challenge automatically
 * with `computeChallengeResponse(challenge, hash)`. A hostile LAN host that
 * answered a discovery probe could pick the challenge and the salt and collect
 * an HMAC under the master-derived secret, which is crackable offline. So a
 * host that the user never scanned must first prove it holds the *pairing*
 * secret over a nonce *we* chose. That HMAC is not an oracle for the vault
 * password.
 */
import { computeHostProof, constantTimeEquals, normalizeHostProofSecret } from '@pkey/core';

export interface MasterProofInput {
  /** Nonce sent with our `challenge_request`. */
  clientNonce: string;
  /** `serverProof` field of the `challenge` message (untrusted). */
  serverProof: unknown;
  /** `salt` field of the `challenge` message (untrusted). */
  salt: unknown;
  /** Salt of the last successful session with this master ('' when unknown). */
  pinnedSalt: string;
  /** Pairing secret delivered inside encrypted `auth_ok` ('' when unpaired). */
  hostProofSecret: string;
}

/**
 * True when the peer proved possession of the pairing secret for `clientNonce`.
 * Fails closed: a missing nonce, a missing proof, a salt that does not match the
 * pinned one, or no pairing secret all return false.
 */
export function verifyMasterProof(input: MasterProofInput): boolean {
  const { clientNonce, serverProof, salt, pinnedSalt, hostProofSecret } = input;
  if (!clientNonce) return false;
  if (typeof serverProof !== 'string' || serverProof.length === 0) return false;
  const secret = normalizeHostProofSecret(hostProofSecret);
  if (!secret) return false;
  // A different salt means a different vault (or a chosen-salt attack): reject
  // before treating the host as ours.
  if (pinnedSalt && salt !== pinnedSalt) return false;
  return constantTimeEquals(computeHostProof(clientNonce, secret), serverProof);
}
