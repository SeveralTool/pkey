const { applyBackupFlags, FULL_BACKUP_XML, DATA_EXTRACTION_XML } = require('./index');

describe('with-backup-rules', () => {
  it('sets allowBackup false and points each attribute at its own schema', () => {
    const doc = {
      manifest: {
        application: [{ $: {} as Record<string, string> }],
      },
    };
    applyBackupFlags(doc);
    const attrs = doc.manifest.application[0].$;
    expect(attrs['android:allowBackup']).toBe('false');
    expect(attrs['android:fullBackupContent']).toBe('@xml/pkey_backup_rules');
    expect(attrs['android:dataExtractionRules']).toBe('@xml/pkey_data_extraction_rules');
    expect(FULL_BACKUP_XML).toContain('<full-backup-content>');
    expect(FULL_BACKUP_XML).not.toContain('data-extraction-rules');
    expect(DATA_EXTRACTION_XML).toContain('<data-extraction-rules>');
    expect(DATA_EXTRACTION_XML).toContain('<device-transfer>');
    expect(DATA_EXTRACTION_XML).not.toContain('full-backup-content');
  });
});
