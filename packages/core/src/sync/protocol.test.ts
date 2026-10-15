import { describe, expect, it } from 'vitest';
import {
  ACTION_CONFIRM_TIMEOUT_MS,
  CONTROL_WIRE_TTL_MS,
  CURRENT_PROTOCOL,
  MIN_SUPPORTED_PROTOCOL,
  PWA_PHONE_PROMPT_ABSOLUTE_MS,
  PWA_PHONE_PROMPT_RESPOND_MS,
  UNLOCK_TIMEOUT_MS,
  isProtocolCompatible,
} from './protocol';

describe('isProtocolCompatible', () => {
  it('rejects retired plaintext v1 and accepts v2 through the current version', () => {
    expect(MIN_SUPPORTED_PROTOCOL).toBe(2);
    expect(isProtocolCompatible(1)).toBe(false);
    expect(isProtocolCompatible(0)).toBe(false);
    expect(isProtocolCompatible(Number.NaN)).toBe(false);
    expect(isProtocolCompatible(MIN_SUPPORTED_PROTOCOL)).toBe(true);
    expect(isProtocolCompatible(CURRENT_PROTOCOL)).toBe(true);
    expect(isProtocolCompatible(CURRENT_PROTOCOL + 1)).toBe(false);
  });
});

describe('phone prompt budgets', () => {
  it('keeps control-frame freshness shorter than the human wait', () => {
    expect(ACTION_CONFIRM_TIMEOUT_MS).toBe(
      PWA_PHONE_PROMPT_ABSOLUTE_MS + PWA_PHONE_PROMPT_RESPOND_MS
    );
    expect(UNLOCK_TIMEOUT_MS).toBe(ACTION_CONFIRM_TIMEOUT_MS);
    expect(CONTROL_WIRE_TTL_MS).toBe(30_000);
    expect(CONTROL_WIRE_TTL_MS).toBeLessThan(PWA_PHONE_PROMPT_ABSOLUTE_MS);
    expect(CONTROL_WIRE_TTL_MS).toBeLessThan(ACTION_CONFIRM_TIMEOUT_MS);
  });
});
