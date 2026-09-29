import './src/bootstrap/cryptoPolyfill';
import './src/bootstrap/nativePbkdf2';
import 'react-native-gesture-handler';
import 'react-native-reanimated';

global.Buffer = require('buffer').Buffer;

import React, { useEffect } from 'react';
import { ActivityIndicator, InteractionManager, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from './src/context/AppContext';
import { useCoreState } from './src/context/CoreStateContext';
import { useSettings } from './src/context/SettingsContext';
import { LoginScreen } from './src/screens/LoginScreen';

const DashboardScreen = React.lazy(() =>
  import('./src/screens/DashboardScreen').then((mod) => ({ default: mod.DashboardScreen }))
);
import { MigrationFlowScreen } from './src/components/migration/MigrationFlowScreen';
import {
  CustomPromptModal,
  IconSelectorModal,
  OperationBusyOverlay,
} from './src/components/common';
import { DeleteAllConfirmModal, ResetSessionConfirmModal } from './src/components/security';
import { VaultForkModal } from './src/components/sync/VaultForkModal';
import { ActionConfirmModal } from './src/components/sync/ActionConfirmModal';
import { UnlockPhoneModal } from './src/components/sync/UnlockPhoneModal';
import { AppErrorBoundary } from './src/components/common/AppErrorBoundary';
import { NotificationOverlay } from './src/components/notifications/NotificationOverlay';
import { NotificationOverlayErrorBoundary } from './src/components/notifications/NotificationOverlayErrorBoundary';
import { useOsNotificationRouting } from './src/hooks/useOsNotificationRouting';

const DashboardFallback = () => {
  const { c } = useSettings();
  return (
    <View
      style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}
      accessibilityRole="progressbar"
    >
      <ActivityIndicator size="large" color={c.accent} />
    </View>
  );
};

const MainApp = () => {
  const { isLogged } = useCoreState();
  useOsNotificationRouting();

  useEffect(() => {
    let active = true;
    let cancelProbe = (): void => undefined;
    const task = InteractionManager.runAfterInteractions(() => {
      void import('./src/bootstrap/nativeCrypto').then((mod) => {
        if (!active) return;
        cancelProbe = mod.scheduleNativeCryptoProbe();
      });
    });
    return () => {
      active = false;
      task.cancel();
      cancelProbe();
    };
  }, []);

  // flex:1 host so in-tree bottom-sheet overlays (not RN Modal) cover the screen
  // and participate in Android soft-keyboard resize.
  return (
    <View style={{ flex: 1 }}>
      <AppErrorBoundary>
        {!isLogged ? (
          <LoginScreen />
        ) : (
          <React.Suspense fallback={<DashboardFallback />}>
            <DashboardScreen />
          </React.Suspense>
        )}
      </AppErrorBoundary>
      <CustomPromptModal />
      <OperationBusyOverlay />
      <DeleteAllConfirmModal />
      <ResetSessionConfirmModal />
      <VaultForkModal />
      <ActionConfirmModal />
      <UnlockPhoneModal />
      <IconSelectorModal />
      <NotificationOverlayErrorBoundary>
        <NotificationOverlay />
      </NotificationOverlayErrorBoundary>
      <MigrationFlowScreen />
    </View>
  );
};

export default function App() {
  return (
    <AppErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AppProvider>
            <MainApp />
          </AppProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}
