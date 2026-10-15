/**
 * @fileoverview Main authorized interface acting as a hub for the inner tabs.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StatusBar } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import vaultKeys, { isPkeyVaultKeysAvailable } from 'pkey-vault-keys';

import { useSettings } from '../context/SettingsContext';
import { noteForegroundActivity } from '../hooks/useForegroundIdleLock';
import { DashboardTabNavigator } from '../navigation/DashboardTabNavigator';
import { DashboardFloatingTabBar } from '../navigation/DashboardFloatingTabBar';
import { setDashboardTopInsetConsumed } from '../navigation/dashboardTopInset';
import { globalStyles as styles, spacing } from '../styles/globalStyles';

/** Side insets only. The top inset lives on scroll content so it can move under the status bar. */
const DASHBOARD_SAFE_EDGES = ['left', 'right'] as const;

/**
 * Dashboard container: rooted-device banner + native tab screens with a floating glass pill.
 */
export const DashboardScreen = React.memo(function DashboardScreen() {
  const { t, c, isDark } = useSettings();
  const insets = useSafeAreaInsets();
  const [rooted, setRooted] = useState(false);

  useEffect(() => {
    if (!isPkeyVaultKeysAvailable() || !vaultKeys) return;
    let cancelled = false;
    void vaultKeys.detectCompromisedDevice().then((r) => {
      if (cancelled) return;
      setRooted(r.compromised);
      setDashboardTopInsetConsumed(r.compromised);
    });
    return () => {
      cancelled = true;
      setDashboardTopInsetConsumed(false);
    };
  }, []);

  return (
    <SafeAreaView
      style={[styles.rootWrap, { backgroundColor: c.bg }]}
      edges={DASHBOARD_SAFE_EDGES}
      onTouchStart={noteForegroundActivity}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      {rooted ? (
        <View
          style={{
            paddingTop: insets.top + spacing.sm,
            paddingBottom: spacing.sm,
            paddingHorizontal: spacing.lg,
            backgroundColor: '#7c2d12',
          }}
        >
          <Text style={{ color: '#fff7ed', fontSize: 12 }}>{t.rooted_banner}</Text>
        </View>
      ) : null}

      <View style={styles.centerFlexFrame}>
        <DashboardTabNavigator />
        <DashboardFloatingTabBar />
      </View>
    </SafeAreaView>
  );
});
