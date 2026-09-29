/**
 * @fileoverview Tests for dashboard tab names, navigation guards, and chrome insets.
 */
import { isDashboardTabName } from './types';
import { shouldNavigateDashboardTab } from './dashboardNav';
import {
  estimateTabBarInset,
  estimateTabBarScrollPadding,
  estimateCardsListBottomPadding,
  estimateFabBottom,
  estimateToastBottomPadding,
  TAB_BAR_PILL_HEIGHT,
  TAB_BAR_PILL_BOTTOM_GAP,
  TAB_BAR_MIN_BOTTOM_PAD,
  TAB_BAR_FAB_SIZE,
  TAB_BAR_FAB_GAP,
  estimatePillBottom,
} from './tabBarInset';

describe('isDashboardTabName', () => {
  it('accepts the four dashboard tabs', () => {
    expect(isDashboardTabName('cards')).toBe(true);
    expect(isDashboardTabName('stats')).toBe(true);
    expect(isDashboardTabName('security')).toBe(true);
    expect(isDashboardTabName('settings')).toBe(true);
  });

  it('rejects unknown names', () => {
    expect(isDashboardTabName('login')).toBe(false);
    expect(isDashboardTabName('')).toBe(false);
    expect(isDashboardTabName(null)).toBe(false);
    expect(isDashboardTabName(1)).toBe(false);
  });
});

describe('shouldNavigateDashboardTab', () => {
  it('does not navigate when the navigator is not ready', () => {
    expect(shouldNavigateDashboardTab(false, undefined, 'security')).toBe(false);
  });

  it('does not navigate when the native tab is already focused', () => {
    expect(shouldNavigateDashboardTab(true, 'security', 'security')).toBe(false);
  });

  it('navigates when a different tab is requested', () => {
    expect(shouldNavigateDashboardTab(true, 'cards', 'settings')).toBe(true);
  });
});

describe('tabBarInset', () => {
  it('uses the minimum pad when the OS reports a tiny inset', () => {
    expect(estimateTabBarInset(0)).toBe(
      TAB_BAR_PILL_HEIGHT + TAB_BAR_PILL_BOTTOM_GAP + TAB_BAR_MIN_BOTTOM_PAD
    );
    expect(estimateTabBarInset(4)).toBe(
      TAB_BAR_PILL_HEIGHT + TAB_BAR_PILL_BOTTOM_GAP + TAB_BAR_MIN_BOTTOM_PAD
    );
  });

  it('adds the system inset when it is larger than the minimum', () => {
    expect(estimateTabBarInset(34)).toBe(TAB_BAR_PILL_HEIGHT + TAB_BAR_PILL_BOTTOM_GAP + 34);
    expect(estimatePillBottom(34)).toBe(TAB_BAR_PILL_BOTTOM_GAP + 34);
  });

  it('clears the FAB and last card above the floating pill', () => {
    const inset = estimateTabBarInset(34);
    expect(estimateFabBottom(34)).toBe(inset + TAB_BAR_FAB_GAP);
    expect(estimateCardsListBottomPadding(34)).toBe(inset + TAB_BAR_FAB_SIZE + TAB_BAR_FAB_GAP);
    expect(estimateTabBarScrollPadding(34)).toBe(inset + 16);
    expect(estimateToastBottomPadding(34)).toBe(inset + 12);
  });
});
