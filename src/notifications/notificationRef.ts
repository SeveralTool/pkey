/**
 * @fileoverview Imperative notification API ref for use outside React components.
 */
import { NotificationAPI } from './types';

let notificationApi: NotificationAPI | null = null;

/** Registers the React notification API for imperative callers. */
export const registerNotificationApi = (api: NotificationAPI): void => {
  notificationApi = api;
};

/** Clears the imperative notification API ref (provider unmount). */
export const unregisterNotificationApi = (): void => {
  notificationApi = null;
};

const requireApi = (): NotificationAPI => {
  if (!notificationApi) {
    throw new Error('Notification API is not initialized. Wrap the app with NotificationProvider.');
  }
  return notificationApi;
};

/** Imperative notification helpers; throws if `NotificationProvider` is not mounted. */
export const notifications = {
  toast: (...args: Parameters<NotificationAPI['toast']>) => requireApi().toast(...args),
  alert: (...args: Parameters<NotificationAPI['alert']>) => requireApi().alert(...args),
  dismiss: (...args: Parameters<NotificationAPI['dismiss']>) => requireApi().dismiss(...args),
  os: (...args: Parameters<NotificationAPI['os']>) => requireApi().os(...args),
};

/** Safe toast that no-ops if provider is not mounted yet. */
export const safeToast = (...args: Parameters<NotificationAPI['toast']>): string | null => {
  if (!notificationApi) return null;
  return notificationApi.toast(...args);
};

/** Safe alert that no-ops if provider is not mounted yet. */
export const safeAlert = (...args: Parameters<NotificationAPI['alert']>): string | null => {
  if (!notificationApi) return null;
  return notificationApi.alert(...args);
};

/** Safe OS notification that no-ops if provider is not mounted yet. */
export const safeOsNotification = (...args: Parameters<NotificationAPI['os']>): Promise<void> => {
  if (!notificationApi) return Promise.resolve();
  return notificationApi.os(...args);
};
