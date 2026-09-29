/**
 * @fileoverview Estimated floating tab-pill chrome used to pad lists, FAB, and toasts.
 *
 * The system tab bar is hidden; a floating capsule sits above the home indicator.
 * Content scrolls behind the pill so glass / translucency can sample it.
 */

/** Visual height of the floating capsule (icon + label + inner pad). */
export const TAB_BAR_PILL_HEIGHT = 54;
/** Gap between the capsule and the left/right screen edges. */
export const TAB_BAR_PILL_H_MARGIN = 18;
/** Gap between the capsule and the home-indicator / nav inset. */
export const TAB_BAR_PILL_BOTTOM_GAP = 10;
/** Minimum bottom inset when the OS reports a tiny/zero value. */
export const TAB_BAR_MIN_BOTTOM_PAD = 8;
/** Cards FAB diameter (`floatingPlusFabMainAction`). */
export const TAB_BAR_FAB_SIZE = 56;
/** Gap between the FAB and the top of the floating pill. */
export const TAB_BAR_FAB_GAP = 16;

/** Distance from the screen bottom to the top of the floating pill. */
export function estimateTabBarInset(bottomSafeArea: number): number {
  return (
    TAB_BAR_PILL_HEIGHT + TAB_BAR_PILL_BOTTOM_GAP + Math.max(bottomSafeArea, TAB_BAR_MIN_BOTTOM_PAD)
  );
}

/** Extra space so the last ScrollView block clears the pill. */
export function estimateTabBarScrollPadding(bottomSafeArea: number): number {
  return estimateTabBarInset(bottomSafeArea) + 16;
}

/** Cards list padding so the last card clears both the FAB and the pill. */
export function estimateCardsListBottomPadding(bottomSafeArea: number): number {
  return estimateTabBarInset(bottomSafeArea) + TAB_BAR_FAB_SIZE + TAB_BAR_FAB_GAP;
}

/** `bottom` offset for the cards FAB above the floating pill. */
export function estimateFabBottom(bottomSafeArea: number): number {
  return estimateTabBarInset(bottomSafeArea) + TAB_BAR_FAB_GAP;
}

/** Bottom toast stack padding (pill + small gap). */
export function estimateToastBottomPadding(bottomSafeArea: number): number {
  return estimateTabBarInset(bottomSafeArea) + 12;
}

/** `bottom` style for the absolutely positioned capsule. */
export function estimatePillBottom(bottomSafeArea: number): number {
  return TAB_BAR_PILL_BOTTOM_GAP + Math.max(bottomSafeArea, TAB_BAR_MIN_BOTTOM_PAD);
}
