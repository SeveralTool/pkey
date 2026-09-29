/**
 * @fileoverview Native tab screens for the unlocked dashboard.
 *
 * Nested under Dashboard only — Login and global overlays stay outside React Navigation.
 * The system tab bar is hidden; chrome is `DashboardFloatingTabBar` (glass island).
 */
import React, { useCallback, useMemo } from 'react';
import { DarkTheme, DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeBottomTabNavigator } from '@react-navigation/bottom-tabs/unstable';
import { useUI } from '../context/UIContext';
import { useSettings } from '../context/SettingsContext';
import { CardsTab } from '../screens/CardsTab';
import { dashboardNavRef, navigateDashboardTab } from './dashboardNav';
import { dashboardTabIcon } from './dashboardTabIcons';
import { isDashboardTabName, type DashboardTabParamList } from './types';

const Tab = createNativeBottomTabNavigator<DashboardTabParamList>();

/**
 * Native bottom-tab host for Cards / Stats / Security / Settings.
 * Two-way syncs with `UIContext.currentTab` so Stats chips and OS notification
 * routing keep working without knowing about the navigator.
 */
export function DashboardTabNavigator(): React.JSX.Element {
  const { currentTab, setCurrentTab } = useUI();
  const { t, c, isDark } = useSettings();

  const navTheme = useMemo<Theme>(
    () => ({
      ...(isDark ? DarkTheme : DefaultTheme),
      colors: {
        ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
        primary: c.accent,
        background: c.bg,
        card: c.cardBg,
        text: c.text,
        border: c.border,
        notification: c.danger,
      },
    }),
    [c.accent, c.bg, c.border, c.cardBg, c.danger, c.text, isDark]
  );

  const onStateChange = useCallback(() => {
    const name = dashboardNavRef.getCurrentRoute()?.name;
    if (isDashboardTabName(name) && name !== currentTab) {
      setCurrentTab(name);
    }
  }, [currentTab, setCurrentTab]);

  return (
    <NavigationContainer
      ref={dashboardNavRef}
      theme={navTheme}
      linking={{ enabled: false, prefixes: [] }}
      onStateChange={onStateChange}
      onReady={() => {
        navigateDashboardTab(currentTab);
      }}
    >
      <Tab.Navigator
        initialRouteName={currentTab}
        backBehavior="none"
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
          overrideScrollViewContentInsetAdjustmentBehavior: false,
        }}
      >
        <Tab.Screen
          name="cards"
          component={CardsTab}
          options={{
            title: t.cards_title,
            tabBarLabel: t.cards_title,
            tabBarIcon: dashboardTabIcon('cards'),
            lazy: false,
          }}
        />
        <Tab.Screen
          name="stats"
          getComponent={() => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            return require('../screens/StatsTab').StatsTab;
          }}
          options={{
            title: t.stats_title,
            tabBarLabel: t.stats_title,
            tabBarIcon: dashboardTabIcon('stats'),
            lazy: true,
          }}
        />
        <Tab.Screen
          name="security"
          getComponent={() => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            return require('../screens/SecurityTab').SecurityTab;
          }}
          options={{
            title: t.security_title,
            tabBarLabel: t.security_title,
            tabBarIcon: dashboardTabIcon('security'),
            lazy: true,
          }}
        />
        <Tab.Screen
          name="settings"
          getComponent={() => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            return require('../screens/SettingsTab').SettingsTab;
          }}
          options={{
            title: t.settings_title,
            tabBarLabel: t.settings_title,
            tabBarIcon: dashboardTabIcon('settings'),
            lazy: true,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
