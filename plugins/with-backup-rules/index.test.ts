const { applyBackupFlags } = require('./index');

describe('with-backup-rules', () => {
  it('sets allowBackup false and extraction rules', () => {
    const doc = {
      manifest: {
        application: [{ $: {} }],
      },
    };
    applyBackupFlags(doc);
    expect(doc.manifest.application[0].$['android:allowBackup']).toBe('false');
    expect(doc.manifest.application[0].$['android:dataExtractionRules']).toContain(
      'pkey_data_extraction_rules'
    );
  });
});
