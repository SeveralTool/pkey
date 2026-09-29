/**
 * @fileoverview UI-thread attention pulse for a failed required field or group.
 *
 * Combines the existing horizontal shake with a one-shot outline flash.
 * Both animations run on the UI thread and no-op when Reduce Motion is on.
 */
import { useCallback } from 'react';
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useReducedMotion } from './useReducedMotion';
import { useShakeAnimation } from './useShakeAnimation';

const FLASH_IN_MS = 80;
const FLASH_OUT_MS = 520;

/**
 * Returns a `trigger` plus styles to attach to the invalid surface.
 * `shakeStyle` goes on the wrapper; `flashStyle` on an absolute outline overlay.
 */
export function useValidationAttention() {
  const reduceMotion = useReducedMotion();
  const { trigger: triggerShake, animatedStyle: shakeStyle } = useShakeAnimation();
  const flashOpacity = useSharedValue(0);

  const trigger = useCallback(() => {
    triggerShake();
    if (reduceMotion) return;
    flashOpacity.value = 0;
    flashOpacity.value = withSequence(
      withTiming(1, { duration: FLASH_IN_MS, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: FLASH_OUT_MS, easing: Easing.inOut(Easing.quad) })
    );
  }, [flashOpacity, reduceMotion, triggerShake]);

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  return { trigger, shakeStyle, flashStyle };
}
