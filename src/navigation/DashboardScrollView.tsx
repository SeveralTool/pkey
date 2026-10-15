/**
 * @fileoverview Edge-to-edge scroller for Stats, Security, and Settings.
 *
 * The viewport starts under the translucent status bar. `paddingTop` on the content
 * container keeps the first block below the clock at rest and scrolls away with the
 * content, so the page can draw through the status bar. No scroll listener drives
 * that layout: the native ScrollView does the work. The scroll callback here only
 * remembers the offset so a tab blur can abort an in-flight fling.
 * `contentInsetAdjustmentBehavior="never"` avoids stacking iOS's automatic
 * safe-area inset on top of that padding.
 */
import React, { useCallback, useRef } from 'react';
import {
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../styles/globalStyles';
import { estimateTabBarInset } from './tabBarInset';
import {
  estimateEdgeToEdgeScrollIndicatorTop,
  estimateEdgeToEdgeTopPadding,
  useDashboardTopInsetConsumed,
} from './dashboardTopInset';
import { useParkScrollOnBlur } from './useParkScrollOnBlur';

/**
 * Dashboard tab body that scrolls behind the status bar.
 */
export function DashboardScrollView({
  contentContainerStyle,
  style,
  children,
  onScroll,
  onScrollBeginDrag,
  onScrollEndDrag,
  onMomentumScrollBegin,
  onMomentumScrollEnd,
  scrollEventThrottle,
  ...rest
}: ScrollViewProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const topInsetConsumed = useDashboardTopInsetConsumed();
  const paddingTop = estimateEdgeToEdgeTopPadding(insets.top, topInsetConsumed, spacing.lg);
  const indicatorTop = estimateEdgeToEdgeScrollIndicatorTop(insets.top, topInsetConsumed);
  const scrollRef = useRef<ScrollView>(null);
  const offsetYRef = useRef(0);

  const parkScroll = useParkScrollOnBlur(() => {
    scrollRef.current?.scrollTo({ y: offsetYRef.current, animated: false });
  });

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetYRef.current = event.nativeEvent.contentOffset.y;
      onScroll?.(event);
    },
    [onScroll]
  );

  const handleScrollBeginDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      parkScroll.onScrollBeginDrag();
      onScrollBeginDrag?.(event);
    },
    [onScrollBeginDrag, parkScroll]
  );

  const handleScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      parkScroll.onScrollEndDrag(event.nativeEvent.velocity?.y ?? 0);
      onScrollEndDrag?.(event);
    },
    [onScrollEndDrag, parkScroll]
  );

  const handleMomentumScrollBegin = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      parkScroll.onMomentumScrollBegin();
      onMomentumScrollBegin?.(event);
    },
    [onMomentumScrollBegin, parkScroll]
  );

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      parkScroll.onMomentumScrollEnd();
      onMomentumScrollEnd?.(event);
    },
    [onMomentumScrollEnd, parkScroll]
  );

  return (
    <ScrollView
      {...rest}
      ref={scrollRef}
      style={[{ flex: 1, backgroundColor: 'transparent' }, style]}
      contentInsetAdjustmentBehavior="never"
      scrollEventThrottle={scrollEventThrottle ?? 16}
      onScroll={handleScroll}
      onScrollBeginDrag={handleScrollBeginDrag}
      onScrollEndDrag={handleScrollEndDrag}
      onMomentumScrollBegin={handleMomentumScrollBegin}
      onMomentumScrollEnd={handleMomentumScrollEnd}
      scrollIndicatorInsets={{
        top: indicatorTop,
        bottom: estimateTabBarInset(insets.bottom),
      }}
      contentContainerStyle={[contentContainerStyle, { paddingTop }]}
    >
      {children}
    </ScrollView>
  );
}
