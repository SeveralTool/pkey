/**
 * @fileoverview Deadline for a PWA unlock / action-confirm while the phone is locked or backgrounded.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { PWA_PHONE_PROMPT_ABSOLUTE_MS, PWA_PHONE_PROMPT_RESPOND_MS } from '@pkey/core';

export interface PwaPromptExpiryInput {
  readonly requestedAt: number;
  readonly now: number;
  readonly canRespond: boolean;
  /** Wall clock when the app was first in front with the vault unlocked. */
  readonly respondSince: number | null;
  readonly absoluteMs?: number;
  readonly respondWindowMs?: number;
}

/**
 * Milliseconds until a phone-side PWA prompt should be abandoned, or `'expire'`.
 *
 * Time spent backgrounded or on the lock screen counts only toward
 * {@link PWA_PHONE_PROMPT_ABSOLUTE_MS}. The respond window starts once the user
 * can actually authenticate.
 */
export function msUntilPwaPromptExpiry(input: PwaPromptExpiryInput): number | 'expire' {
  const absoluteMs = input.absoluteMs ?? PWA_PHONE_PROMPT_ABSOLUTE_MS;
  const respondWindowMs = input.respondWindowMs ?? PWA_PHONE_PROMPT_RESPOND_MS;
  const hardLeft = input.requestedAt + absoluteMs + respondWindowMs - input.now;
  if (hardLeft <= 0) return 'expire';

  // Once the user could respond, keep that window through biometric `inactive`
  // blips. Falling back to the absolute cap here would expire the prompt under
  // the OS dialog.
  if (input.respondSince != null) {
    const respondLeft = input.respondSince + respondWindowMs - input.now;
    if (respondLeft <= 0) return 'expire';
    return Math.min(respondLeft, hardLeft);
  }

  if (!input.canRespond) {
    const absoluteLeft = input.requestedAt + absoluteMs - input.now;
    if (absoluteLeft <= 0) return 'expire';
    return absoluteLeft;
  }

  return Math.min(respondWindowMs, hardLeft);
}

/**
 * Arms a single PWA prompt deadline. Background / locked time does not consume
 * the foreground respond window. `onExpire` runs at most once per `requestId`.
 */
export function usePwaPromptDeadline(
  requestId: string | null,
  isLogged: boolean,
  onExpire: (requestId: string) => void
): void {
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const clockRef = useRef<{
    id: string;
    requestedAt: number;
    respondSince: number | null;
  } | null>(null);

  useEffect(() => {
    if (!requestId) {
      clockRef.current = null;
      return;
    }
    if (clockRef.current?.id !== requestId) {
      clockRef.current = { id: requestId, requestedAt: Date.now(), respondSince: null };
    }
    const clock = clockRef.current;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let expired = false;

    const arm = (): void => {
      if (expired) return;
      if (timer) clearTimeout(timer);
      const canRespond = isLogged && AppState.currentState === 'active';
      if (canRespond && clock.respondSince == null) clock.respondSince = Date.now();
      const wait = msUntilPwaPromptExpiry({
        requestedAt: clock.requestedAt,
        now: Date.now(),
        canRespond,
        respondSince: clock.respondSince,
      });
      if (wait === 'expire') {
        expired = true;
        onExpireRef.current(requestId);
        return;
      }
      timer = setTimeout(arm, wait);
    };

    const sub = AppState.addEventListener('change', () => arm());
    arm();
    return () => {
      sub.remove();
      if (timer) clearTimeout(timer);
    };
  }, [requestId, isLogged]);
}
