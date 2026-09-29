/**
 * @fileoverview In-app notification queue logic.
 */
import { AlertOptions, InAppNotificationItem, ToastOptions } from './types';

/** Default auto-dismiss duration for toast notifications (ms). */
export const DEFAULT_TOAST_DURATION = 5000;
/** Maximum number of toasts shown concurrently in the overlay. */
export const MAX_VISIBLE_NOTIFICATIONS = 3;

let idCounter = 0;

/** Allocates a unique in-app notification id. */
export const createNotificationId = (): string => {
  idCounter += 1;
  return `notif-${Date.now()}-${idCounter}`;
};

/** Maps a notification variant to its default screen area. */
export const getPositionForVariant = (
  variant: InAppNotificationItem['variant']
): InAppNotificationItem['position'] =>
  variant === 'error' || variant === 'warning' ? 'top' : 'bottom';

/** Builds a toast notification item from options. */
export const buildToastItem = (options: ToastOptions): InAppNotificationItem => ({
  id: createNotificationId(),
  mode: 'toast',
  title: options.title,
  message: options.message,
  variant: options.variant ?? 'info',
  duration: options.duration ?? DEFAULT_TOAST_DURATION,
  position: options.position ?? getPositionForVariant(options.variant ?? 'info'),
  sensitive: options.sensitive ?? false,
  actions: [],
  createdAt: Date.now(),
});

/** Builds an alert (modal) notification item from options. */
export const buildAlertItem = (options: AlertOptions): InAppNotificationItem => ({
  id: createNotificationId(),
  mode: 'alert',
  title: options.title,
  message: options.message,
  variant: options.variant ?? 'info',
  duration: options.duration ?? 0,
  position: options.position ?? getPositionForVariant(options.variant ?? 'info'),
  sensitive: options.sensitive ?? false,
  actions: options.actions ?? [],
  createdAt: Date.now(),
});

/** Appends a notification and trims the queue to `MAX_VISIBLE_NOTIFICATIONS`. */
export const enqueueNotification = (
  queue: InAppNotificationItem[],
  item: InAppNotificationItem
): InAppNotificationItem[] => {
  const next = [...queue, item];
  if (next.length <= MAX_VISIBLE_NOTIFICATIONS) return next;
  return next.slice(next.length - MAX_VISIBLE_NOTIFICATIONS);
};

/** Removes a notification by id from the queue. */
export const removeNotification = (
  queue: InAppNotificationItem[],
  id: string
): InAppNotificationItem[] => queue.filter((item) => item.id !== id);

/** Maps a notification variant to a theme color. */
export const getVariantColor = (
  variant: InAppNotificationItem['variant'],
  theme: {
    accent: string;
    success: string;
    warning: string;
    danger: string;
    text: string;
  }
): string => {
  switch (variant) {
    case 'success':
      return theme.success;
    case 'warning':
      return theme.warning;
    case 'error':
      return theme.danger;
    case 'info':
    default:
      return theme.accent;
  }
};

/** Maps a notification variant to an Ionicons glyph name. */
export const getVariantIcon = (
  variant: InAppNotificationItem['variant']
): keyof typeof import('@expo/vector-icons').Ionicons.glyphMap => {
  switch (variant) {
    case 'success':
      return 'checkmark-circle';
    case 'warning':
      return 'warning';
    case 'error':
      return 'alert-circle';
    case 'info':
    default:
      return 'information-circle';
  }
};
