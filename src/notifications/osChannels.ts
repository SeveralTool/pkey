/**
 * @fileoverview Android notification channel definitions for PKEY.
 */
import {
  OS_WEB_BROWSER_CATEGORY,
  OS_PWA_CONFIRM_CATEGORY,
  stringifyOsNotificationData,
} from './osNotificationData';
import { OsNotificationChannel, OsNotificationPayload } from './types';

export const OS_CHANNELS: Record<
  OsNotificationChannel,
  { name: string; description: string; importance: number }
> = {
  'pkey-security': {
    name: 'PKEY Security',
    description: 'Security alerts such as screenshot detection.',
    importance: 4,
  },
  'pkey-actions': {
    name: 'PKEY Actions',
    description: 'Credential and vault activity notifications.',
    importance: 3,
  },
};

export const OS_NOTIFICATION_COLOR = '#87cb28';

/** Maps a product OS payload to expo-notifications content (string-only `data`). */
export const buildOsNotificationContent = (payload: OsNotificationPayload) => {
  const data = stringifyOsNotificationData(payload.data);
  const isBrowserSynced = data.type === 'web-browser-synced';
  const isPwaConfirm = data.type === 'pwa-action-confirm';
  const isPwaUnlock = data.type === 'pwa-unlock';
  return {
    title: payload.title,
    body: payload.body,
    data,
    ...(payload.channel ? { channelId: payload.channel } : {}),
    ...(isBrowserSynced ? { categoryIdentifier: OS_WEB_BROWSER_CATEGORY } : {}),
    ...(isPwaConfirm || isPwaUnlock ? { categoryIdentifier: OS_PWA_CONFIRM_CATEGORY } : {}),
  };
};
