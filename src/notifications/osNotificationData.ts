/**
 * @fileoverview OS notification `data` payload: Android string-only extras + tap parsing.
 *
 * Notification extras are untrusted (OS / expo). Values are validated with a
 * small schema (equivalent to zod object parsing) — no `as T` on the raw bag.
 */

/** Default tap (notification body) identifier used by expo-notifications. */
export const OS_DEFAULT_ACTION_ID = 'expo.modules.notifications.actions.DEFAULT';
/** Destructive action: block the LAN web client that just synced. */
export const OS_BLOCK_ACTION_ID = 'block';
/** Decline a pending PWA action-confirm without biometrics. */
export const OS_DENY_ACTION_ID = 'deny';
/** Opens the share sheet for an automatic `.pkey` backup. */
export const OS_SHARE_ACTION_ID = 'share';
/** Android/iOS category that hosts the Block button. */
export const OS_WEB_BROWSER_CATEGORY = 'pkey-web-browser';
/** Android/iOS category that hosts the Deny button for PWA action confirm. */
export const OS_PWA_CONFIRM_CATEGORY = 'pkey-pwa-action-confirm';
/** Android/iOS category that hosts Share for automatic backups. */
export const OS_AUTO_BACKUP_CATEGORY = 'pkey-auto-backup';

export type OsNotificationDataType =
  | 'web-browser-synced'
  | 'screenshot-detected'
  | 'web-lan-changed'
  | 'pwa-action-confirm'
  | 'pwa-unlock'
  | 'auto-backup-ready'
  | 'auto-backup-failed';

export interface ParsedOsNotificationData {
  type: OsNotificationDataType;
  sourceId: string | null;
  socketId: string | null;
  ip: string | null;
  requestId: string | null;
  filename: string | null;
}

const DATA_TYPES = new Set<string>([
  'web-browser-synced',
  'screenshot-detected',
  'web-lan-changed',
  'pwa-action-confirm',
  'pwa-unlock',
  'auto-backup-ready',
  'auto-backup-failed',
]);

const AUTO_BACKUP_FILENAME_RE = /^pkey-auto-\d{8}-\d{6}(?:-\d+)?\.pkey$/i;

function parseAutoBackupFilename(value: unknown): string | null {
  const name = optionalString(value);
  if (!name) return null;
  if (name.includes('/') || name.includes('\\') || name.includes('..')) return null;
  if (!AUTO_BACKUP_FILENAME_RE.test(name)) return null;
  return name;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value !== 'null' && value !== 'undefined';

const optionalString = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (!isNonEmptyString(value)) return null;
  return value.trim();
};

/**
 * Drops null/undefined and stringifies remaining values so Android extras stay valid.
 */
export const stringifyOsNotificationData = (
  data: Record<string, unknown> | undefined
): Record<string, string> => {
  if (!data) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    const next = optionalString(value);
    if (next) out[key] = next;
  }
  return out;
};

/** Parses untrusted OS notification `data` into a typed intent payload, or `null`. */
export const parseOsNotificationData = (raw: unknown): ParsedOsNotificationData | null => {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const type = optionalString(rec.type);
  if (!type || !DATA_TYPES.has(type)) return null;
  const filename = parseAutoBackupFilename(rec.filename);
  if (type === 'auto-backup-ready' && !filename) return null;
  return {
    type: type as OsNotificationDataType,
    sourceId: optionalString(rec.sourceId),
    socketId: optionalString(rec.socketId),
    ip: optionalString(rec.ip),
    requestId: optionalString(rec.requestId),
    filename: type === 'auto-backup-ready' ? filename : null,
  };
};

export type OsNotificationIntentKind =
  | 'screenshot'
  | 'web-open'
  | 'web-block'
  | 'pwa-confirm-open'
  | 'pwa-confirm-deny'
  | 'pwa-unlock-open'
  | 'pwa-unlock-deny'
  | 'auto-backup-open'
  | 'auto-backup-share';

export interface OsNotificationIntent {
  kind: OsNotificationIntentKind;
  sourceId: string | null;
  socketId: string | null;
  ip: string | null;
  requestId: string | null;
  filename: string | null;
  /** True when the vault was locked at tap time — login satisfies auth for block. */
  unlockedAtDispatch: boolean;
}

/** Stable key for one OS notification response (tap or action button). */
export function osNotificationResponseKey(
  actionIdentifier: string,
  data: unknown,
  meta?: { readonly identifier?: string | null; readonly date?: number | null }
): string {
  const id = meta?.identifier ?? '';
  const date = meta?.date ?? '';
  let payload = '';
  try {
    payload = JSON.stringify(data ?? null);
  } catch {
    payload = '';
  }
  return `${id}\n${date}\n${actionIdentifier}\n${payload}`;
}

/**
 * Drops the duplicate delivery expo fires for one tap (listener plus
 * `getLastNotificationResponseAsync` on the next configure). A later tap of a
 * newly scheduled alert has a different key.
 */
export function shouldDeliverOsNotificationResponse(
  previous: { readonly key: string; readonly at: number } | null,
  next: { readonly key: string; readonly at: number },
  windowMs = 20_000
): boolean {
  if (!previous) return true;
  if (previous.key !== next.key) return true;
  return next.at - previous.at >= windowMs;
}

/** Maps a notification response (action + data) to a routing intent. */
export const intentFromOsResponse = (
  actionIdentifier: string,
  rawData: unknown
): OsNotificationIntent | null => {
  const data = parseOsNotificationData(rawData);
  if (!data) return null;

  if (data.type === 'screenshot-detected') {
    return {
      kind: 'screenshot',
      sourceId: null,
      socketId: null,
      ip: null,
      requestId: null,
      filename: null,
      unlockedAtDispatch: false,
    };
  }

  if (data.type === 'web-lan-changed') {
    return {
      kind: 'web-open',
      sourceId: null,
      socketId: null,
      ip: null,
      requestId: null,
      filename: null,
      unlockedAtDispatch: false,
    };
  }

  if (data.type === 'auto-backup-failed') {
    return {
      kind: 'auto-backup-open',
      sourceId: null,
      socketId: null,
      ip: null,
      requestId: null,
      filename: null,
      unlockedAtDispatch: false,
    };
  }

  if (data.type === 'auto-backup-ready') {
    const isShare =
      actionIdentifier === OS_SHARE_ACTION_ID ||
      actionIdentifier.endsWith(`:${OS_SHARE_ACTION_ID}`);
    return {
      kind: isShare ? 'auto-backup-share' : 'auto-backup-open',
      sourceId: null,
      socketId: null,
      ip: null,
      requestId: null,
      filename: data.filename,
      unlockedAtDispatch: false,
    };
  }

  if (data.type === 'pwa-action-confirm') {
    const isDeny =
      actionIdentifier === OS_DENY_ACTION_ID || actionIdentifier.endsWith(`:${OS_DENY_ACTION_ID}`);
    return {
      kind: isDeny ? 'pwa-confirm-deny' : 'pwa-confirm-open',
      sourceId: data.sourceId,
      socketId: data.socketId,
      ip: data.ip,
      requestId: data.requestId,
      filename: null,
      unlockedAtDispatch: false,
    };
  }

  if (data.type === 'pwa-unlock') {
    const isDeny =
      actionIdentifier === OS_DENY_ACTION_ID || actionIdentifier.endsWith(`:${OS_DENY_ACTION_ID}`);
    return {
      kind: isDeny ? 'pwa-unlock-deny' : 'pwa-unlock-open',
      sourceId: data.sourceId,
      socketId: data.socketId,
      ip: data.ip,
      requestId: data.requestId,
      filename: null,
      unlockedAtDispatch: false,
    };
  }

  const isBlock =
    actionIdentifier === OS_BLOCK_ACTION_ID || actionIdentifier.endsWith(`:${OS_BLOCK_ACTION_ID}`);

  return {
    kind: isBlock ? 'web-block' : 'web-open',
    sourceId: data.sourceId,
    socketId: data.socketId,
    ip: data.ip,
    requestId: null,
    filename: null,
    unlockedAtDispatch: false,
  };
};
