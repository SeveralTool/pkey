/**
 * @fileoverview Notification provider with in-app queue and OS notification API.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSettings } from './SettingsContext';
import {
  buildAlertItem,
  buildToastItem,
  enqueueNotification,
  removeNotification,
} from '../notifications/inAppNotifications';
import {
  registerNotificationApi,
  unregisterNotificationApi,
} from '../notifications/notificationRef';
import { sendOsNotification } from '../notifications/osNotificationService';
import { notificationThemeFromColors } from '../notifications/notificationTheme';
import {
  AlertOptions,
  InAppNotificationItem,
  NotificationAPI,
  OsNotificationPayload,
  ToastOptions,
} from '../notifications/types';

interface NotificationContextData {
  queue: InAppNotificationItem[];
  toast: (options: ToastOptions) => string;
  alert: (options: AlertOptions) => string;
  dismiss: (id: string) => void;
  os: (payload: OsNotificationPayload) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextData>({} as NotificationContextData);

/** Consumes toast/alert/OS notification helpers from `NotificationProvider`. */
export const useNotifications = () => useContext(NotificationContext);

/** Provides the in-app notification queue and imperative notification API. */
export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [queue, setQueue] = useState<InAppNotificationItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setQueue((current) => removeNotification(current, id));
  }, []);

  const toast = useCallback((options: ToastOptions): string => {
    const item = buildToastItem(options);
    setQueue((current) => enqueueNotification(current, item));
    return item.id;
  }, []);

  const alert = useCallback((options: AlertOptions): string => {
    const item = buildAlertItem(options);
    setQueue((current) => enqueueNotification(current, item));
    return item.id;
  }, []);

  const os = useCallback(async (payload: OsNotificationPayload): Promise<void> => {
    await sendOsNotification(payload);
  }, []);

  const api = useMemo<NotificationAPI>(
    () => ({
      toast,
      alert,
      dismiss,
      os,
    }),
    [alert, dismiss, os, toast]
  );

  useEffect(() => {
    registerNotificationApi(api);
    return () => unregisterNotificationApi();
  }, [api]);

  const value = useMemo(
    () => ({
      queue,
      toast,
      alert,
      dismiss,
      os,
    }),
    [alert, dismiss, os, queue, toast]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};

/** Theme colors for notification cards derived from the active settings palette. */
export const useNotificationTheme = () => {
  const settings = useSettings();
  return useMemo(() => notificationThemeFromColors(settings?.c), [settings]);
};
