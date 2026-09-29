/**
 * @fileoverview Native OS notification service via expo-notifications (lazy-loaded).
 */
import { Platform } from 'react-native';
import { buildOsNotificationContent, OS_CHANNELS, OS_NOTIFICATION_COLOR } from './osChannels';
import { canUseNativeOsNotifications } from './osNotificationCapabilities';
import {
  OS_BLOCK_ACTION_ID,
  OS_DENY_ACTION_ID,
  OS_WEB_BROWSER_CATEGORY,
  OS_PWA_CONFIRM_CATEGORY,
  intentFromOsResponse,
  type OsNotificationIntent,
} from './osNotificationData';
import { OsNotificationPayload } from './types';

type ExpoNotificationsModule = typeof import('expo-notifications');

let notificationsModule: ExpoNotificationsModule | null = null;
let loadAttempted = false;
let responseSub: { remove: () => void } | null = null;
let queuedResponse: { actionIdentifier: string; data: unknown } | null = null;
let intentHandler: ((intent: OsNotificationIntent) => void) | null = null;

const loadNotificationsModule = async (): Promise<ExpoNotificationsModule | null> => {
  if (!canUseNativeOsNotifications()) return null;
  if (notificationsModule) return notificationsModule;
  if (loadAttempted) return notificationsModule;

  loadAttempted = true;
  try {
    notificationsModule = await import('expo-notifications');
    return notificationsModule;
  } catch (error) {
    console.warn('[PKEY] expo-notifications unavailable:', error);
    notificationsModule = null;
    return null;
  }
};

const deliverResponse = (actionIdentifier: string, data: unknown): void => {
  const intent = intentFromOsResponse(actionIdentifier, data);
  if (!intent) return;
  if (intentHandler) {
    intentHandler(intent);
    return;
  }
  queuedResponse = { actionIdentifier, data };
};

const attachResponseListener = (Notifications: ExpoNotificationsModule): void => {
  if (responseSub) return;
  responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    deliverResponse(response.actionIdentifier, response.notification.request.content.data);
  });
};

const consumeLastResponse = async (Notifications: ExpoNotificationsModule): Promise<void> => {
  try {
    const last = await Notifications.getLastNotificationResponseAsync();
    if (!last) return;
    deliverResponse(last.actionIdentifier, last.notification.request.content.data);
    const clear = (
      Notifications as ExpoNotificationsModule & {
        clearLastNotificationResponseAsync?: () => Promise<void>;
      }
    ).clearLastNotificationResponseAsync;
    if (clear) await clear();
  } catch (error) {
    console.warn('[PKEY] Failed to read last OS notification response:', error);
  }
};

/** Registers the in-app handler for OS notification taps / actions. */
export const setOsNotificationIntentHandler = (
  handler: ((intent: OsNotificationIntent) => void) | null
): void => {
  intentHandler = handler;
  if (handler && queuedResponse) {
    const queued = queuedResponse;
    queuedResponse = null;
    deliverResponse(queued.actionIdentifier, queued.data);
  }
};

export const configureOsNotifications = async (
  blockActionTitle?: string,
  denyActionTitle?: string
): Promise<boolean> => {
  const Notifications = await loadNotificationsModule();
  if (!Notifications) return false;

  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    if (Platform.OS === 'android') {
      for (const [channelId, channel] of Object.entries(OS_CHANNELS)) {
        await Notifications.setNotificationChannelAsync(channelId, {
          name: channel.name,
          description: channel.description,
          importance: channel.importance,
          lightColor: OS_NOTIFICATION_COLOR,
          vibrationPattern: [0, 250, 250, 250],
        });
      }
    }

    const title = blockActionTitle?.trim() || 'Block';
    const denyTitle = denyActionTitle?.trim() || 'Deny';
    try {
      await Notifications.setNotificationCategoryAsync(OS_WEB_BROWSER_CATEGORY, [
        {
          identifier: OS_BLOCK_ACTION_ID,
          buttonTitle: title,
          options: {
            opensAppToForeground: true,
            isDestructive: true,
          },
        },
      ]);
      await Notifications.setNotificationCategoryAsync(OS_PWA_CONFIRM_CATEGORY, [
        {
          identifier: OS_DENY_ACTION_ID,
          buttonTitle: denyTitle,
          options: {
            opensAppToForeground: false,
            isDestructive: true,
          },
        },
      ]);
    } catch (error) {
      console.warn('[PKEY] Failed to register OS notification category:', error);
    }

    attachResponseListener(Notifications);
    await consumeLastResponse(Notifications);

    return true;
  } catch (error) {
    console.warn('[PKEY] Failed to configure OS notifications:', error);
    return false;
  }
};

export const ensureOsNotificationPermissions = async (
  blockActionTitle?: string,
  denyActionTitle?: string
): Promise<boolean> => {
  const Notifications = await loadNotificationsModule();
  if (!Notifications) return false;

  const configured = await configureOsNotifications(blockActionTitle, denyActionTitle);
  if (!configured) return false;

  try {
    const current = await Notifications.getPermissionsAsync();
    if (
      current.granted ||
      current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    ) {
      return true;
    }

    const requested = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: false,
        allowSound: true,
      },
    });

    return (
      requested.granted ||
      requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    );
  } catch (error) {
    console.warn('[PKEY] OS notification permission request failed:', error);
    return false;
  }
};

/**
 * Shows a native OS notification when supported.
 * @returns true if the notification was scheduled on the OS tray.
 */
export const sendOsNotification = async (payload: OsNotificationPayload): Promise<boolean> => {
  const Notifications = await loadNotificationsModule();
  if (!Notifications) return false;

  const hasPermission = await ensureOsNotificationPermissions();
  if (!hasPermission) return false;

  const content = buildOsNotificationContent(payload);

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: payload.id,
      content: {
        ...content,
        sound: true,
        ...(Platform.OS === 'android' ? { color: OS_NOTIFICATION_COLOR } : {}),
      },
      trigger: null,
    });
    return true;
  } catch (error) {
    console.warn('[PKEY] Failed to schedule OS notification:', error);
    return false;
  }
};
