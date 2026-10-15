/**
 * @fileoverview Scroll-gesture phase for parking a fling when a dashboard tab blurs.
 *
 * React Native's Android scroller is time-based. Detaching the view does not
 * abort it, so the next frame jumps ahead by the time spent on another tab.
 */

export type ScrollActivity = 'idle' | 'drag' | 'momentum';

export type ScrollActivityEvent = 'begin-drag' | 'end-drag' | 'momentum-begin' | 'momentum-end';

/**
 * Finger releases slower than this are a settled drag.
 * Matches the threshold already used by the cards list header.
 */
export const SCROLL_MOMENTUM_VELOCITY = 0.05;

/**
 * Next gesture phase after a scroll-view callback.
 * `velocityY` is only read for `end-drag`.
 */
export function nextScrollActivity(
  _current: ScrollActivity,
  event: ScrollActivityEvent,
  velocityY = 0
): ScrollActivity {
  switch (event) {
    case 'begin-drag':
      return 'drag';
    case 'momentum-begin':
      return 'momentum';
    case 'momentum-end':
      return 'idle';
    case 'end-drag':
      return Math.abs(velocityY) < SCROLL_MOMENTUM_VELOCITY ? 'idle' : 'momentum';
    default:
      return _current;
  }
}

/** True while a finger or a fling can still move the offset after the tab is covered. */
export function shouldParkScrollOnBlur(activity: ScrollActivity): boolean {
  return activity !== 'idle';
}
