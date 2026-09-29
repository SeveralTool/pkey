/**
 * Expo config plugin — disable Android backups of vault material (audit M8).
 *
 * Sets `android:allowBackup="false"` and `android:dataExtractionRules` so
 * Google One / adb backup cannot copy the encrypted vault, SecureStore
 * files, or autofill cache.
 */

const fs = require('node:fs');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

const RULES_NAME = 'pkey_data_extraction_rules.xml';

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
  app.$['android:fullBackupContent'] = '@xml/pkey_data_extraction_rules';
  app.$['android:dataExtractionRules'] = '@xml/pkey_data_extraction_rules';
  return doc;
}

module.exports = function withBackupRules(config) {
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const xmlDir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, RULES_NAME), DATA_EXTRACTION_XML, 'utf8');
      return cfg;
    },
  ]);
  return withAndroidManifest(config, (cfg) => {
    applyBackupFlags(cfg.modResults);
    return cfg;
  });
};

module.exports.applyBackupFlags = applyBackupFlags;
