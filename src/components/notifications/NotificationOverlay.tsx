/**
 * @fileoverview Global notification overlay mounted at app root.
 */
import React from 'react';
import { useNotificationTheme, useNotifications } from '../../context/NotificationContext';
import { NotificationHost } from './NotificationHost';

export const NotificationOverlay = () => {
  const { queue, dismiss } = useNotifications();
  const theme = useNotificationTheme();

  return <NotificationHost queue={queue} theme={theme} onDismiss={dismiss} />;
};
