/**
 * @fileoverview Abort an in-flight dashboard scroll when its tab blurs.
 */
import { useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { nextScrollActivity, shouldParkScrollOnBlur, type ScrollActivity } from './scrollActivity';

export type ScrollParkHandlers = Readonly<{
  onScrollBeginDrag: () => void;
  onScrollEndDrag: (velocityY: number) => void;
  onMomentumScrollBegin: () => void;
  onMomentumScrollEnd: () => void;
}>;

/**
 * Parks the native scroller on blur while a drag or fling is still active.
 *
 * `park` must apply the last committed offset with `animated: false`. On Android
 * that command aborts `OverScroller` before writing the offset, so a later attach
 * cannot catch the animation up.
 *
 * Must run inside the dashboard navigation container.
 */
export function useParkScrollOnBlur(park: () => void): ScrollParkHandlers {
  const activityRef = useRef<ScrollActivity>('idle');
  const parkRef = useRef(park);
  parkRef.current = park;

  useFocusEffect(
    useCallback(() => {
      return () => {
        if (!shouldParkScrollOnBlur(activityRef.current)) return;
        activityRef.current = 'idle';
        parkRef.current();
      };
    }, [])
  );

  return useMemo(
    () => ({
      onScrollBeginDrag: () => {
        activityRef.current = nextScrollActivity(activityRef.current, 'begin-drag');
      },
      onScrollEndDrag: (velocityY: number) => {
        activityRef.current = nextScrollActivity(activityRef.current, 'end-drag', velocityY);
      },
      onMomentumScrollBegin: () => {
        activityRef.current = nextScrollActivity(activityRef.current, 'momentum-begin');
      },
      onMomentumScrollEnd: () => {
        activityRef.current = nextScrollActivity(activityRef.current, 'momentum-end');
      },
    }),
    []
  );
}
