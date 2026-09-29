/**
 * @fileoverview Wire payloads — re-exported from @pkey/core for a single source of truth.
 */
export type {
  AuthChallenge,
  AuthRequest,
  AuthResult,
  SyncPushPayload,
  SyncPullPayload,
  ProtocolError,
  ProtocolErrorCode,
  VaultForkAction,
  PwaActionConfirmKind,
  ActionConfirmDenyReason,
  ActionConfirmRequest,
  ActionConfirmResult,
} from '@pkey/core';

export {
  CURRENT_PROTOCOL,
  MIN_SUPPORTED_PROTOCOL,
  isProtocolCompatible,
  emptySyncIndex,
  VAULT_FORK_TYPE,
  VAULT_FORK_DECISION_TYPE,
  SERVER_PUSH_TYPE,
  SYNC_PULL_REQUEST_TYPE,
  ACTION_CONFIRM_REQUEST_TYPE,
  ACTION_CONFIRM_RESULT_TYPE,
  ACTION_CONFIRM_CANCEL_TYPE,
  ACTION_CONFIRM_TIMEOUT_MS,
  ACTION_CONFIRM_RATE_MAX,
  ACTION_CONFIRM_RATE_WINDOW_MS,
  UNLOCK_REQUEST_TYPE,
  UNLOCK_OFFER_TYPE,
  UNLOCK_GRANT_TYPE,
  UNLOCK_CANCEL_TYPE,
  UNLOCK_TIMEOUT_MS,
  UNLOCK_RATE_MAX,
  UNLOCK_RATE_WINDOW_MS,
} from '@pkey/core';
