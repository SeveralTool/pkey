/**
 * @fileoverview Who owns the dashboard's top safe-area inset.
 *
 * Every unlocked tab draws under the translucent status bar. Scroll content pads
 * itself so the first block rests below the clock and can move underneath while
 * scrolling. The compromised-device banner sits in normal layout flow and already
 * includes that inset, so descendants must not add it again.
 */
import { useSyncExternalStore } from 'react';

let topInsetConsumed = false;
const listeners = new Set<() => void>();

/** Subscribes to {@link setDashboardTopInsetConsumed}. The listener reads the flag itself. */
export function subscribeDashboardTopInsetConsumed(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** @returns Whether a dashboard chrome row above the tabs already cleared the status bar. */
export function getDashboardTopInsetConsumed(): boolean {
  return topInsetConsumed;
}

/**
 * Publish whether dashboard chrome above the tab body already includes the status-bar inset.
 * No-ops when the value does not change.
 */
export function setDashboardTopInsetConsumed(consumed: boolean): void {
  if (consumed === topInsetConsumed) return;
  topInsetConsumed = consumed;
  listeners.forEach((listener) => listener());
}

/** Live flag for scroll content that must not pad the status bar a second time. */
export function useDashboardTopInsetConsumed(): boolean {
  return useSyncExternalStore(
    subscribeDashboardTopInsetConsumed,
    getDashboardTopInsetConsumed,
    getDashboardTopInsetConsumed
  );
}

/**
 * Top padding for scroll content that draws edge-to-edge under the status bar.
 * The padding is part of the scrollable content, so it leaves the viewport while scrolling.
 *
 * @param topSafeArea - `useSafeAreaInsets().top`
 * @param topInsetConsumed - True when a parent row already cleared the status bar
 * @param contentPad - Gap between the status bar (or that parent row) and the first block
 */
export function estimateEdgeToEdgeTopPadding(
  topSafeArea: number,
  topInsetConsumed: boolean,
  contentPad: number
): number {
  const pad = Math.max(0, contentPad);
  if (topInsetConsumed) return pad;
  return Math.max(0, topSafeArea) + pad;
}

/**
 * Scroll-indicator inset so the bar starts below the clock.
 * Zero when the scroller itself already begins below the status bar.
 */
export function estimateEdgeToEdgeScrollIndicatorTop(
  topSafeArea: number,
  topInsetConsumed: boolean
): number {
  if (topInsetConsumed) return 0;
  return Math.max(0, topSafeArea);
}
