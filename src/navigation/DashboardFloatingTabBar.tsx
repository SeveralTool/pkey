/**
 * @fileoverview Floating capsule tab bar overlaid on the dashboard.
 *
 * Native UITabBar / BottomNavigationView stay hidden; this island is the chrome.
 * Content scrolls behind it. Selected tab uses a sliding inset chip.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useUI } from '../context/UIContext';
import { useSettings } from '../context/SettingsContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { GlassSurface } from './GlassSurface';
import { estimatePillBottom, TAB_BAR_PILL_HEIGHT, TAB_BAR_PILL_H_MARGIN } from './tabBarInset';
import { DASHBOARD_TAB_NAMES, type DashboardTabName } from './types';

const INNER_PAD = 4;
/** Extra inset so the selected chip sits inside its cell, not flush to neighbors. */
const CHIP_GAP = 2;
const ICON_SIZE = 20;
const SPRING = { damping: 22, stiffness: 280, mass: 0.7 };
const ACCENT_RGB = '135, 203, 40';

type TabVisual = Readonly<{
  name: DashboardTabName;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconFocused: React.ComponentProps<typeof Ionicons>['name'];
  label: (t: ReturnType<typeof useSettings>['t']) => string;
}>;

const TAB_VISUALS: readonly TabVisual[] = [
  {
    name: 'cards',
    icon: 'key-outline',
    iconFocused: 'key',
    label: (t) => t.cards_title,
  },
  {
    name: 'stats',
    icon: 'shield-checkmark-outline',
    iconFocused: 'shield-checkmark',
    label: (t) => t.stats_title,
  },
  {
    name: 'security',
    icon: 'lock-closed-outline',
    iconFocused: 'lock-closed',
    label: (t) => t.security_title,
  },
  {
    name: 'settings',
    icon: 'settings-outline',
    iconFocused: 'settings',
    label: (t) => t.settings_title,
  },
];

type TabCellProps = Readonly<{
  tab: TabVisual;
  selected: boolean;
  color: string;
  label: string;
  onPress: () => void;
}>;

function TabCell({ tab, selected, color, label, onPress }: TabCellProps): React.JSX.Element {
  return (
    <Pressable
      style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <Ionicons name={selected ? tab.iconFocused : tab.icon} size={ICON_SIZE} color={color} />
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        style={[styles.label, selected ? styles.labelSelected : styles.labelIdle, { color }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Overlay capsule with glass material and a sliding selected chip. */
export function DashboardFloatingTabBar(): React.JSX.Element {
  const { currentTab, setCurrentTab } = useUI();
  const { t, c, isDark } = useSettings();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const selectedIndex = Math.max(0, DASHBOARD_TAB_NAMES.indexOf(currentTab));
  const [trackWidth, setTrackWidth] = useState(0);
  const indexSv = useSharedValue(selectedIndex);

  useEffect(() => {
    if (reduceMotion) {
      indexSv.value = selectedIndex;
      return;
    }
    indexSv.value = withSpring(selectedIndex, SPRING);
  }, [indexSv, reduceMotion, selectedIndex]);

  const indicatorStyle = useAnimatedStyle(() => {
    const inner = Math.max(0, trackWidth - INNER_PAD * 2);
    const tabW = inner / DASHBOARD_TAB_NAMES.length;
    const chipW = Math.max(0, tabW - CHIP_GAP * 2);
    return {
      width: chipW,
      transform: [{ translateX: INNER_PAD + CHIP_GAP + tabW * indexSv.value }],
    };
  }, [trackWidth]);

  const onSelect = useCallback(
    (name: DashboardTabName) => {
      if (name === currentTab) return;
      void Haptics.selectionAsync().catch(() => undefined);
      setCurrentTab(name);
    },
    [currentTab, setCurrentTab]
  );

  const rim = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.08)';
  const innerSheen = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.55)';
  const highlight = isDark ? `rgba(${ACCENT_RGB}, 0.16)` : `rgba(${ACCENT_RGB}, 0.12)`;
  const highlightRim = isDark ? `rgba(${ACCENT_RGB}, 0.42)` : `rgba(${ACCENT_RGB}, 0.38)`;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { bottom: estimatePillBottom(insets.bottom) }]}
    >
      <GlassSurface
        isDark={isDark}
        style={[
          styles.pill,
          {
            borderColor: rim,
            shadowColor: '#000000',
          },
        ]}
      >
        <View
          style={styles.track}
          accessibilityRole="tablist"
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              { backgroundColor: highlight, borderColor: highlightRim },
              indicatorStyle,
            ]}
          />
          {TAB_VISUALS.map((tab) => {
            const selected = currentTab === tab.name;
            const color = selected ? c.accent : c.textMuted;
            return (
              <TabCell
                key={tab.name}
                tab={tab}
                selected={selected}
                color={color}
                label={tab.label(t)}
                onPress={() => onSelect(tab.name)}
              />
            );
          })}
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.innerSheen,
            {
              borderTopColor: innerSheen,
              borderLeftColor: innerSheen,
              borderRightColor: innerSheen,
            },
          ]}
        />
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: TAB_BAR_PILL_H_MARGIN,
    right: TAB_BAR_PILL_H_MARGIN,
    zIndex: 50,
    elevation: 24,
  },
  pill: {
    height: TAB_BAR_PILL_HEIGHT,
    borderRadius: TAB_BAR_PILL_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  innerSheen: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: TAB_BAR_PILL_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
  },
  track: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  indicator: {
    position: 'absolute',
    top: INNER_PAD,
    bottom: INNER_PAD,
    borderRadius: (TAB_BAR_PILL_HEIGHT - INNER_PAD * 2) / 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    zIndex: 1,
  },
  cellPressed: {
    opacity: 0.72,
  },
  label: {
    fontSize: 9,
    letterSpacing: 0.12,
    maxWidth: '92%',
    includeFontPadding: false,
    lineHeight: 11,
  },
  labelIdle: {
    fontWeight: '600',
  },
  labelSelected: {
    fontWeight: '700',
  },
});
