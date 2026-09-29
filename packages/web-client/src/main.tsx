/**
 * @fileoverview Browser entry: initializes the app store and mounts the Solid root.
 */
/* @refresh reload */
import { render } from 'solid-js/web';
import './index.css';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { initApp } from './state/appStore';

initApp();
render(
  () => (
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  ),
  document.getElementById('root')!
);
