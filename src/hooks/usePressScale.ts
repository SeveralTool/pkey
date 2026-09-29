/**
 * @fileoverview Press-in / press-out scale feedback for touchable surfaces.
 */
import { useCallback } from 'react';
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useReducedMotion } from './useReducedMotion';

const PRESSED_SCALE = 0.97;
const SPRING = { damping: 15, stiffness: 400, mass: 0.6 };

/**
 * Scale-down on press for physical button feel.
 * Wire `onPressIn` / `onPressOut` to a Pressable or TouchableOpacity.
 * @param pressedScale Scale while pressed (default 0.97).
 * @param initialScale Starting scale (use 0 for entrance animations).
 */
export function usePressScale(pressedScale: number = PRESSED_SCALE, initialScale: number = 1) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(initialScale);

  const onPressIn = useCallback(() => {
    if (reduceMotion) {
      scale.value = pressedScale;
      return;
    }
    scale.value = withSpring(pressedScale, SPRING);
  }, [pressedScale, reduceMotion, scale]);

  const onPressOut = useCallback(() => {
    if (reduceMotion) {
      scale.value = 1;
      return;
    }
    scale.value = withSpring(1, SPRING);
  }, [reduceMotion, scale]);

  /** One-shot entrance: scale 0 → 1 (FAB mount). */
  const playEntrance = useCallback(() => {
    if (reduceMotion) {
      scale.value = 1;
      return;
    }
    scale.value = 0;
    scale.value = withSpring(1, { damping: 12, stiffness: 180, mass: 0.8 });
  }, [reduceMotion, scale]);

  /** Instant reset without animation (e.g. unmount prep). */
  const reset = useCallback(
    (to: number = 1) => {
      scale.value = withTiming(to, { duration: 0 });
    },
    [scale]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return { onPressIn, onPressOut, playEntrance, reset, animatedStyle, scale };
}
