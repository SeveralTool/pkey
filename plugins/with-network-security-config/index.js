/**
 * Expo config plugin — writes an Android network security XML that restricts
 * cleartext HTTP to LAN-relevant destinations and wires it into the manifest.
 *
 * Rationale (audit finding C6):
 *  - PKey needs cleartext HTTP for the on-device web server (port 7392), mDNS
 *    `.local` hostnames, and (in dev) Metro bundler over `http://<lan-ip>:8081`.
 *  - A global `usesCleartextTraffic="true"` allows plaintext to any host; we
 *    prefer an explicit network security config.
 *
 * Android limitation (important):
 *  - `domain-config` matches hostnames and *exact* IP literals per `<domain>`,
 *    not CIDR ranges. Invalid `<domain-suffix>` tags are ignored by the platform.
 *  - RFC-1918 IP literals (e.g. `http://192.168.0.42:7392`) therefore require
 *    `cleartextTrafficPermitted="true"` on `base-config` for release builds.
 *    Sync payloads remain encrypted at the application layer.
 *  - **Debug** builds (`assembleDebug`) ship an overlay under
 *    `src/debug/res/xml/` that permits cleartext broadly so Metro / dev-client
 *    always works even when the QR code points at a LAN IP.
 */

const fs = require('node:fs');
const path = require('node:path');

const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

const XML_NAME = 'network_security_config.xml';

/** Release / main source set — LAN + loopback + `.local` mDNS; cleartext base for IP literals. */
const NETWORK_SECURITY_XML = `<?xml version="1.0" encoding="utf-8"?>
<!--
  PKey network security config — audit finding C6 (Android-corrected).
  See plugins/with-network-security-config/index.js for platform limits.
-->
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">127.0.0.1</domain>
        <domain includeSubdomains="false">10.0.2.2</domain>
        <!-- mDNS hostnames: casa-a1b2.local, pkey-android-xxxx.local, etc. -->
        <domain includeSubdomains="true">local</domain>
    </domain-config>

    <!-- Required for http://192.168.x.x and other LAN IPs (no CIDR in NSC). -->
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system"/>
        </trust-anchors>
    </base-config>
</network-security-config>
`;

/**
 * Debug / dev-client overlay — Metro bundler uses cleartext HTTP to the dev
 * machine IP; this file overrides main for `debug` and `debugOptimized` variants.
 */
const DEBUG_NETWORK_SECURITY_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system"/>
            <certificates src="user"/>
        </trust-anchors>
    </base-config>
</network-security-config>
`;

function writeXmlFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const platformRoot = cfg.modRequest.platformProjectRoot;
      const mainXmlDir = path.join(platformRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(mainXmlDir, { recursive: true });
      fs.writeFileSync(path.join(mainXmlDir, XML_NAME), NETWORK_SECURITY_XML, 'utf8');

      for (const variant of ['debug', 'debugOptimized']) {
        const variantDir = path.join(platformRoot, 'app', 'src', variant, 'res', 'xml');
        fs.mkdirSync(variantDir, { recursive: true });
        fs.writeFileSync(path.join(variantDir, XML_NAME), DEBUG_NETWORK_SECURITY_XML, 'utf8');
      }
      return cfg;
    },
  ]);
}

function wireManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (!application) return cfg;
    application.$ = application.$ || {};
    application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    application.$['android:usesCleartextTraffic'] = 'false';
    return cfg;
  });
}

/**
 * Expo config plugin entry point.
 * @param {import('@expo/config-plugins').ExpoConfig} config
 */
module.exports = function withNetworkSecurityConfig(config) {
  config = writeXmlFiles(config);
  config = wireManifest(config);
  return config;
};
