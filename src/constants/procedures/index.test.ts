/**
 * @fileoverview In-app help procedures must exist in both languages without mermaid.
 */
import { PROCEDURE_IDS, getProcedure } from './index';

describe('help procedures', () => {
  it('returns non-empty copy for every id in both languages', () => {
    for (const id of PROCEDURE_IDS) {
      for (const lang of ['ESP', 'ING'] as const) {
        const { title, body } = getProcedure(id, lang);
        expect(title.trim().length).toBeGreaterThan(0);
        expect(body.trim().length).toBeGreaterThan(0);
        expect(body).not.toMatch(/```mermaid/);
      }
    }
  });

  it('includes master-password help used on create-session', () => {
    expect(PROCEDURE_IDS).toContain('master_password');
    expect(getProcedure('master_password', 'ESP').title).toMatch(/12/);
    expect(getProcedure('master_password', 'ING').title).toMatch(/12/);
  });

  it('documents the device-secret recovery kit in backup, restore, and switch help', () => {
    expect(PROCEDURE_IDS).toContain('device_secret');
    for (const lang of ['ESP', 'ING'] as const) {
      const kit = lang === 'ESP' ? /kit de recuperaci[oó]n/i : /recovery kit/i;
      expect(getProcedure('backup_export', lang).body).toMatch(kit);
      expect(getProcedure('import_restore', lang).body).toMatch(kit);
      expect(getProcedure('device_secret', lang).body).toMatch(kit);
      expect(getProcedure('device_migration', lang).body).toMatch(kit);
    }
  });
});
