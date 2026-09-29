/**
 * In-app help procedures (user-facing). Runtime source of truth for the mobile app.
 * Keep markdown mirrors under docs/templates/procedures/ in sync.
 */

export type ProcedureLang = 'ESP' | 'ING';

export type ProcedureId =
  | 'vault_health'
  | 'web_access'
  | 'session_lock'
  | 'device_migration'
  | 'backup_export'
  | 'import_restore'
  | 'device_secret'
  | 'danger_zone'
  | 'master_password';

export type ProcedureDoc = {
  id: ProcedureId;
  title: Record<ProcedureLang, string>;
  /** Plain text; paragraphs separated by blank lines. */
  body: Record<ProcedureLang, string>;
};
