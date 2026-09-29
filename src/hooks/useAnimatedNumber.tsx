/**
 * @fileoverview Animates a numeric display from previous value to next (count-up).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import {
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useReducedMotion } from './useReducedMotion';

const DEFAULT_DURATION_MS = 400;

type Options = {
  durationMs?: number;
  /** Delay before starting (stagger). Ignored when reduce-motion is on. */
  delayMs?: number;
};

/**
 * Shared value that tweens toward `target`. Use with `AnimatedNumberText`.
 */
export function useAnimatedNumber(target: number, options: Options = {}) {
  const reduceMotion = useReducedMotion();
  const durationMs = options.durationMs ?? DEFAULT_DURATION_MS;
  const delayMs = options.delayMs ?? 0;
  const value = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      value.value = target;
      return;
    }
    const timing = withTiming(target, { duration: durationMs });
    value.value = delayMs > 0 ? withDelay(delayMs, timing) : timing;
  }, [target, reduceMotion, durationMs, delayMs, value]);

  return value;
}

type AnimatedNumberTextProps = {
  value: number;
  style?: StyleProp<TextStyle>;
  delayMs?: number;
  durationMs?: number;
};

/**
 * Renders an integer that counts toward `value`.
 * Uses a regular `Text` node (not TextInput) so Android ScrollView cannot
 * reset the native string back to a default of "0".
 */
export function AnimatedNumberText({
  value,
  style,
  delayMs = 0,
  durationMs,
}: AnimatedNumberTextProps) {
  const reduceMotion = useReducedMotion();
  const duration = durationMs ?? DEFAULT_DURATION_MS;
  const [shown, setShown] = useState(value);
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    if (reduceMotion) {
      setShown(value);
      return;
    }
    const from = shownRef.current;
    if (from === value) return;

    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const elapsed = now - t0 - delayMs;
      if (elapsed < 0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const p = Math.min(1, elapsed / duration);
      setShown(Math.round(from + (value - from) * p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduceMotion, delayMs, duration]);

  return <Text style={style}>{shown}</Text>;
}
