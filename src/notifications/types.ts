/**
 * @fileoverview Notification module type definitions.
 */

export type NotificationVariant = 'info' | 'success' | 'warning' | 'error';

export type NotificationActionStyle = 'default' | 'cancel' | 'destructive';

/** Screen area where the in-app notification is rendered. */
export type NotificationPosition = 'top' | 'bottom';

export interface NotificationAction {
  text: string;
  style?: NotificationActionStyle;
  onPress?: () => void;
}

export interface ToastOptions {
  title: string;
  message?: string;
  variant?: NotificationVariant;
  /** Auto-dismiss delay in ms. Default 5000. Set 0 to disable auto-dismiss. */
  duration?: number;
  /** Screen area. Defaults by variant: error/warning → 'top', info/success → 'bottom'. */
  position?: NotificationPosition;
  /** If true, the message is never rendered; a lock glyph is shown instead. */
  sensitive?: boolean;
}

export interface AlertOptions {
  title: string;
  message?: string;
  variant?: NotificationVariant;
  actions?: NotificationAction[];
  /** Optional auto-dismiss. Default 0 (no auto-dismiss for alerts). */
  duration?: number;
  /** Screen area. Defaults by variant: error/warning → 'top', info/success → 'bottom'. */
  position?: NotificationPosition;
  /** If true, the message is never rendered; a lock glyph is shown instead. */
  sensitive?: boolean;
}

export type InAppNotificationMode = 'toast' | 'alert';

export interface InAppNotificationItem {
  id: string;
  mode: InAppNotificationMode;
  title: string;
  message?: string;
  variant: NotificationVariant;
  duration: number;
  position: NotificationPosition;
  sensitive: boolean;
  actions: NotificationAction[];
  createdAt: number;
}

export type OsNotificationChannel = 'pkey-security' | 'pkey-actions';

export interface OsNotificationPayload {
  id?: string;
  title: string;
  body: string;
  channel?: OsNotificationChannel;
  /** Untrusted bag; Android extras are stringified before scheduling. */
  data?: Record<string, unknown>;
}

export interface NotificationTheme {
  cardBg: string;
  text: string;
  textMuted: string;
  border: string;
  accent: string;
  danger: string;
  warning: string;
  success: string;
  /** Tinted (low-alpha) accent used for brand badge backgrounds. */
  accentSoft: string;
}

export interface InAppNotificationAPI {
  toast: (options: ToastOptions) => string;
  alert: (options: AlertOptions) => string;
  dismiss: (id: string) => void;
}

export interface NotificationAPI extends InAppNotificationAPI {
  os: (payload: OsNotificationPayload) => Promise<void>;
}
