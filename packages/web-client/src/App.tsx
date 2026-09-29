/**
 * @fileoverview Root Solid.js shell for the PKEY browser (PWA) client.
 *
 * Renders login vs vault based on connection state and mounts shared modals/toasts.
 */
import { Show } from 'solid-js';
import { state } from './state/appStore';
import { LoginScreen } from './components/LoginScreen';
import { VaultScreen } from './components/VaultScreen';
import { CardModal } from './components/CardModal';
import { VerifyModal } from './components/VerifyModal';
import { ReloginOverlay } from './components/ReloginOverlay';
import { Toast } from './components/Toast';

/** Top-level app: vault when previously authenticated; otherwise login. */
export default function App() {
  const showVault = () =>
    state.wasAuthenticated &&
    (state.connState === 'authenticated' ||
      state.connState === 'offline' ||
      state.connState === 'readonly' ||
      (state.connState === 'relogin' && state.sessionUnlocked));

  return (
    <div id="app">
      <Show when={showVault()} fallback={<LoginScreen />}>
        <VaultScreen />
      </Show>
      <CardModal />
      <VerifyModal />
      <ReloginOverlay />
      <Toast />
    </div>
  );
}
