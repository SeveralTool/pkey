/**
 * @fileoverview Native tab icons: SF Symbols on iOS, tinted PNG silhouettes on Android.
 */
import { Platform, type ImageSourcePropType } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';
import type { NativeBottomTabIcon } from '@react-navigation/bottom-tabs/unstable';
import type { DashboardTabName } from './types';

const ANDROID_TAB_ICONS: Record<DashboardTabName, ImageSourcePropType> = {
  cards: require('../../assets/images/tabs/cards.png'),
  stats: require('../../assets/images/tabs/stats.png'),
  security: require('../../assets/images/tabs/security.png'),
  settings: require('../../assets/images/tabs/settings.png'),
};

const IOS_TAB_SYMBOLS: Record<DashboardTabName, { default: SFSymbol; selected: SFSymbol }> = {
  cards: { default: 'key', selected: 'key.fill' },
  stats: { default: 'checkmark.shield', selected: 'checkmark.shield.fill' },
  security: { default: 'lock', selected: 'lock.fill' },
  settings: { default: 'gearshape', selected: 'gearshape.fill' },
};

/**
 * Icon descriptor for a dashboard tab. iOS swaps outline/fill on focus;
 * Android tints a single silhouette for both states.
 */
export function dashboardTabIcon(
  name: DashboardTabName
): NativeBottomTabIcon | ((props: { focused: boolean }) => NativeBottomTabIcon) {
  if (Platform.OS === 'ios') {
    const symbols = IOS_TAB_SYMBOLS[name];
    return ({ focused }) => ({
      type: 'sfSymbol',
      name: focused ? symbols.selected : symbols.default,
    });
  }
  return {
    type: 'image',
    source: ANDROID_TAB_ICONS[name],
  };
}
