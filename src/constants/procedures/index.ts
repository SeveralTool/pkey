/**
 * @fileoverview User-facing help procedures for the mobile app.
 */
import type { ProcedureDoc, ProcedureId, ProcedureLang } from './types';
import { vaultHealthProcedure } from './vaultHealth';
import { webAccessProcedure } from './webAccess';
import { sessionLockProcedure } from './sessionLock';
import { deviceMigrationProcedure } from './deviceMigration';
import { backupExportProcedure } from './backupExport';
import { importRestoreProcedure } from './importRestore';
import { deviceSecretProcedure } from './deviceSecret';
import { dangerZoneProcedure } from './dangerZone';
import { masterPasswordProcedure } from './masterPassword';

export type { ProcedureDoc, ProcedureId, ProcedureLang } from './types';

const PROCEDURES: Record<ProcedureId, ProcedureDoc> = {
  vault_health: vaultHealthProcedure,
  web_access: webAccessProcedure,
  session_lock: sessionLockProcedure,
  device_migration: deviceMigrationProcedure,
  backup_export: backupExportProcedure,
  import_restore: importRestoreProcedure,
  device_secret: deviceSecretProcedure,
  danger_zone: dangerZoneProcedure,
  master_password: masterPasswordProcedure,
};

export const PROCEDURE_IDS: ProcedureId[] = [
  'vault_health',
  'web_access',
  'session_lock',
  'device_migration',
  'backup_export',
  'import_restore',
  'device_secret',
  'danger_zone',
  'master_password',
];

/** Returns localized title + body for a help procedure. */
export function getProcedure(
  id: ProcedureId,
  lang: ProcedureLang
): { title: string; body: string } {
  const doc = PROCEDURES[id];
  const key = lang === 'ESP' ? 'ESP' : 'ING';
  return {
    title: doc.title[key],
    body: doc.body[key],
  };
}
