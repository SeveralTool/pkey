/**
 * @fileoverview Accessibility hook for OS "Reduce motion" preference.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Returns whether the user prefers reduced motion. */
export function useReducedMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduceMotion;
}
