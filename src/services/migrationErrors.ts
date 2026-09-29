/**
 * @fileoverview Typed errors for the migration send flow (localized in MigrationContext).
 */

/** Error codes for migration send flow — map to localized strings in MigrationContext. */
export type MigrationSendErrorCode =
  | 'RECEIVER_UNREACHABLE'
  | 'RECEIVER_BUSY'
  | 'SESSION_MISMATCH'
  | 'PROTOCOL_MISMATCH'
  | 'CHALLENGE_FAILED'
  | 'AUTH_FAILED'
  | 'NO_LOCAL_DB'
  | 'META_FAILED'
  | 'CHUNK_FAILED'
  | 'RECEIVER_ERROR'
  | 'TIMEOUT'
  | 'TCP_UNAVAILABLE';

/** Thrown when a migration send step fails; `code` drives UI copy. */
export class MigrationSendError extends Error {
  readonly code: MigrationSendErrorCode;
  readonly detail?: string;

  constructor(code: MigrationSendErrorCode, detail?: string) {
    super(code);
    this.code = code;
    this.detail = detail;
    this.name = 'MigrationSendError';
  }
}

/** Maps a `MigrationSendError` to a user-facing localized string. */
export const translateMigrationSendError = (
  err: MigrationSendError,
  t: Record<string, string>
): string => {
  const key = `migration_err_${err.code.toLowerCase()}` as keyof typeof t;
  const base = (t[key] as string) || t.migration_send_failed;
  return err.detail ? `${base} (${err.detail})` : base;
};

/** Socket / Node-style `code` on an unknown thrown value. */
export function getUnknownErrorCode(e: unknown): string {
  if (typeof e !== 'object' || e === null || !('code' in e)) return '';
  const code = (e as { code: unknown }).code;
  return typeof code === 'string' ? code : '';
}

/**
 * Reconstructs a {@link MigrationSendError} from instanceof or a serialized `{ name, code }`.
 */
export function coerceMigrationSendError(e: unknown): MigrationSendError | null {
  if (e instanceof MigrationSendError) return e;
  if (typeof e !== 'object' || e === null) return null;
  const rec = e as { name?: unknown; code?: unknown; detail?: unknown };
  if (rec.name !== 'MigrationSendError' || typeof rec.code !== 'string') return null;
  return new MigrationSendError(
    rec.code as MigrationSendErrorCode,
    typeof rec.detail === 'string' ? rec.detail : undefined
  );
}
