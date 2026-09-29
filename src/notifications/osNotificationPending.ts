/**
 * @fileoverview Pending OS notification intent while the vault is locked.
 */

import type { OsNotificationIntent } from './osNotificationData';

let pending: OsNotificationIntent | null = null;

export const setPendingOsNotificationIntent = (intent: OsNotificationIntent): void => {
  pending = intent;
};

export const consumePendingOsNotificationIntent = (): OsNotificationIntent | null => {
  const next = pending;
  pending = null;
  return next;
};
