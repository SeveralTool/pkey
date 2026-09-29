/**
 * @fileoverview Parse/sanitize PWA action-confirm protocol messages.
 *
 * Wire frames are AES-CBC+HMAC envelopes (`encryptControlWire`). Parsers
 * consume the **decrypted inner** — broken envelopes never reach this module.
 */

import type { AppSettings } from '../types/index';
import {
  ACTION_CONFIRM_CANCEL_TYPE,
  ACTION_CONFIRM_REQUEST_TYPE,
  ACTION_CONFIRM_RESULT_TYPE,
  type ActionConfirmDenyReason,
  type ActionConfirmRequest,
  type ActionConfirmResult,
  type PwaActionConfirmKind,
} from './protocol';

const ACTION_KINDS: ReadonlySet<string> = new Set<PwaActionConfirmKind>([
  'edit',
  'delete',
  'reveal',
  'copy',
  'copy_otp',
  'reveal_otp',
  'copy_username',
]);

const DENY_REASONS: ReadonlySet<string> = new Set<ActionConfirmDenyReason>([
  'denied',
  'timeout',
  'unavailable',
  'cancelled',
  'busy',
  'rate_limited',
]);

const REQUEST_ID_RE = /^[A-Za-z0-9._-]{8,64}$/;
const CARD_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

function asRecord(msg: unknown): Record<string, unknown> | null {
  if (!msg || typeof msg !== 'object') return null;
  return msg as Record<string, unknown>;
}

function parseRequestId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return REQUEST_ID_RE.test(id) ? id : null;
}

function parseCardId(value: unknown): string | undefined | null {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return null;
  const id = value.trim();
  if (!id) return undefined;
  return CARD_ID_RE.test(id) ? id : null;
}

function parseActionKind(value: unknown): PwaActionConfirmKind | null {
  if (typeof value !== 'string' || !ACTION_KINDS.has(value)) return null;
  return value as PwaActionConfirmKind;
}

function parseDenyReason(value: unknown): ActionConfirmDenyReason | undefined | null {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !DENY_REASONS.has(value)) return null;
  return value as ActionConfirmDenyReason;
}

function typeIs(rec: Record<string, unknown>, expected: string): boolean {
  return rec.type === undefined || rec.type === expected;
}

/**
 * True when the PWA should send an action-confirm request instead of the
 * local master-password modal.
 */
export function shouldRequestPhoneConfirm(
  settings: Pick<AppSettings, 'webConfirmOnPhone'> | null | undefined,
  liveConnected: boolean
): boolean {
  return liveConnected && settings?.webConfirmOnPhone === true;
}

/** Parses a decrypted control inner (or legacy typed body) into {@link ActionConfirmRequest}. */
export function parseActionConfirmRequest(msg: unknown): ActionConfirmRequest | null {
  const rec = asRecord(msg);
  if (!rec || !typeIs(rec, ACTION_CONFIRM_REQUEST_TYPE)) return null;
  const requestId = parseRequestId(rec.requestId);
  const action = parseActionKind(rec.action);
  const cardId = parseCardId(rec.cardId);
  if (!requestId || !action || cardId === null) return null;
  return cardId ? { requestId, action, cardId } : { requestId, action };
}

/** Parses a decrypted control inner into {@link ActionConfirmResult}. */
export function parseActionConfirmResult(msg: unknown): ActionConfirmResult | null {
  const rec = asRecord(msg);
  if (!rec || !typeIs(rec, ACTION_CONFIRM_RESULT_TYPE)) return null;
  const requestId = parseRequestId(rec.requestId);
  const action = parseActionKind(rec.action);
  const cardId = parseCardId(rec.cardId);
  if (!requestId || !action || typeof rec.ok !== 'boolean' || cardId === null) return null;
  const reason = parseDenyReason(rec.reason);
  if (reason === null) return null;
  const bind = cardId ? { requestId, action, cardId } : { requestId, action };
  if (rec.ok) return { ...bind, ok: true };
  return { ...bind, ok: false, ...(reason ? { reason } : {}) };
}

/**
 * Parses a decrypted cancel inner. Returns the `requestId` or `null`.
 */
export function parseActionConfirmCancel(msg: unknown): string | null {
  const rec = asRecord(msg);
  if (!rec || !typeIs(rec, ACTION_CONFIRM_CANCEL_TYPE)) return null;
  return parseRequestId(rec.requestId);
}

/**
 * True when a result echoes the request the PWA actually sent (closes
 * delete/copy swaps on a forged or tampered result).
 */
export function actionConfirmBindMatches(
  pending: { requestId: string; action: PwaActionConfirmKind; cardId?: string },
  result: Pick<ActionConfirmResult, 'requestId' | 'action' | 'cardId'>
): boolean {
  if (pending.requestId !== result.requestId) return false;
  if (pending.action !== result.action) return false;
  return (pending.cardId ?? '') === (result.cardId ?? '');
}
