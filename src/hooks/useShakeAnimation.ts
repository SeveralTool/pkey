/**
 * @fileoverview Horizontal shake animation for error feedback (e.g. wrong password).
 */
import { useCallback } from 'react';
import {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useReducedMotion } from './useReducedMotion';

const SHAKE_MS = 50;

/**
 * Returns a trigger function and animated style that shakes translateX briefly.
 */
export function useShakeAnimation() {
  const reduceMotion = useReducedMotion();
  const translateX = useSharedValue(0);

  const trigger = useCallback(() => {
    if (reduceMotion) return;
    translateX.value = withSequence(
      withTiming(-12, { duration: SHAKE_MS }),
      withTiming(12, { duration: SHAKE_MS }),
      withTiming(-8, { duration: SHAKE_MS }),
      withTiming(8, { duration: SHAKE_MS }),
      withTiming(0, { duration: SHAKE_MS })
    );
  }, [reduceMotion, translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return { trigger, animatedStyle };
}
