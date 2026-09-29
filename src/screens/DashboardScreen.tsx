/**
 * @fileoverview Main authorized interface acting as a hub for the inner tabs.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useUI } from '../context/UIContext';
import { useSettings } from '../context/SettingsContext';
import { noteForegroundActivity } from '../hooks/useForegroundIdleLock';
import vaultKeys, { isPkeyVaultKeysAvailable } from 'pkey-vault-keys';
import { DashboardTabNavigator } from '../navigation/DashboardTabNavigator';
import { DashboardFloatingTabBar } from '../navigation/DashboardFloatingTabBar';
import { globalStyles as styles } from '../styles/globalStyles';

/**
 * Dashboard container: rooted-device banner + native tab screens with a floating glass pill.
 */
export const DashboardScreen = React.memo(function DashboardScreen() {
  const { currentTab } = useUI();
  const { t, c, isDark } = useSettings();
  const [rooted, setRooted] = useState(false);

  // Native tab bar is hidden; floating pill sits in the home-indicator inset.
  // Cards paints under the status bar.
  const safeEdges =
    currentTab === 'cards' ? (['left', 'right'] as const) : (['top', 'left', 'right'] as const);

  useEffect(() => {
    if (!isPkeyVaultKeysAvailable() || !vaultKeys) return;
    void vaultKeys.detectCompromisedDevice().then((r) => setRooted(r.compromised));
  }, []);

  return (
    <SafeAreaView
      style={[styles.rootWrap, { backgroundColor: c.bg }]}
      edges={safeEdges}
      onTouchStart={noteForegroundActivity}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      {rooted ? (
        <View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#7c2d12' }}>
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
