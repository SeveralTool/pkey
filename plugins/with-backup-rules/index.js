/**
 * Expo config plugin — disable Android backups of vault material (audit M8).
 *
 * Sets `android:allowBackup="false"` plus two rule files. API 31+ reads
 * `dataExtractionRules` (`<data-extraction-rules>`), including device-to-device
 * transfer, which ignores `allowBackup`. API 23–30 reads `fullBackupContent`
 * and only understands `<full-backup-content>`. Pointing both attributes at
 * the extraction file drops those excludes on older platforms if `allowBackup`
 * is later turned on.
 */

const fs = require('node:fs');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

const FULL_BACKUP_NAME = 'pkey_backup_rules.xml';
const EXTRACTION_NAME = 'pkey_data_extraction_rules.xml';

/** Legacy Auto Backup schema. `path="."` excludes the whole domain. */
const FULL_BACKUP_XML = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  <exclude domain="root" path="." />
  <exclude domain="file" path="." />
  <exclude domain="database" path="." />
  <exclude domain="sharedpref" path="." />
  <exclude domain="external" path="." />
</full-backup-content>
`;

const DATA_EXTRACTION_XML = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="root" />
    <exclude domain="file" />
    <exclude domain="database" />
    <exclude domain="sharedpref" />
    <exclude domain="external" />
  </cloud-backup>
  <device-transfer>
    <exclude domain="root" />
    <exclude domain="file" />
    <exclude domain="database" />
    <exclude domain="sharedpref" />
    <exclude domain="external" />
  </device-transfer>
</data-extraction-rules>
`;

function applyBackupFlags(doc) {
  const app = doc.manifest?.application?.[0];
  if (!app || !app.$) return doc;
  app.$['android:allowBackup'] = 'false';
  app.$['android:fullBackupContent'] = '@xml/pkey_backup_rules';
  app.$['android:dataExtractionRules'] = '@xml/pkey_data_extraction_rules';
  return doc;
}

module.exports = function withBackupRules(config) {
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const xmlDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml'
      );
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, FULL_BACKUP_NAME), FULL_BACKUP_XML, 'utf8');
      fs.writeFileSync(path.join(xmlDir, EXTRACTION_NAME), DATA_EXTRACTION_XML, 'utf8');
      return cfg;
    },
  ]);
  return withAndroidManifest(config, (cfg) => {
    applyBackupFlags(cfg.modResults);
    return cfg;
  });
};

module.exports.applyBackupFlags = applyBackupFlags;
module.exports.FULL_BACKUP_XML = FULL_BACKUP_XML;
module.exports.DATA_EXTRACTION_XML = DATA_EXTRACTION_XML;
