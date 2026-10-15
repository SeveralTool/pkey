/**
 * Expo config plugin — Wi-Fi permissions without declaring location on Android 13+.
 *
 * Android 12 and below need FINE/COARSE location to read the Wi-Fi name.
 * Android 13+ declares NEARBY_WIFI_DEVICES with neverForLocation so Play does not
 * treat a password manager as a location app.
 *
 * Trade-off (deliberate): on Android 13+ the SSID is still location-gated —
 * `WifiInfo.getSSID()` requires the same permissions as `getScanResults()`
 * (ACCESS_FINE_LOCATION) and otherwise returns `<unknown ssid>`. Because this
 * plugin caps location at maxSdkVersion 32, the app cannot show the network
 * name on Android 13+; `canReadWifiSsid()` in `src/utils/wifiSsidPermission.ts`
 * hides that UI instead of requesting a permission that would not help. To
 * show the SSID there, drop the cap and `neverForLocation` and accept the Play
 * location declaration.
 *
 * Runs after the expo-location plugin so those permissions can be capped with
 * maxSdkVersion 32.
 */

const { withAndroidManifest } = require('@expo/config-plugins');

const FINE = 'android.permission.ACCESS_FINE_LOCATION';
const COARSE = 'android.permission.ACCESS_COARSE_LOCATION';
const NEARBY = 'android.permission.NEARBY_WIFI_DEVICES';
const LOCATION_MAX_SDK = '32';

/**
 * Mutates a parsed Android manifest (Expo `modResults`).
 * @param {import('@expo/config-plugins').AndroidManifest} doc
 */
function applyWifiSsidManifestPermissions(doc) {
  const manifest = doc.manifest;
  if (!manifest) return doc;

  const keys = ['uses-permission', 'uses-permission-sdk-23'];
  for (const key of keys) {
    const nodes = manifest[key];
    if (!Array.isArray(nodes)) continue;
    for (const node of nodes) {
      const name = node.$?.['android:name'];
      if (name === FINE || name === COARSE) {
        node.$['android:maxSdkVersion'] = LOCATION_MAX_SDK;
      }
    }
  }

  const uses = manifest['uses-permission'] || [];
  const hasNearby = uses.some((node) => node.$?.['android:name'] === NEARBY);
  if (!hasNearby) {
    uses.push({
      $: {
        'android:name': NEARBY,
        'android:usesPermissionFlags': 'neverForLocation',
      },
    });
  } else {
    for (const node of uses) {
      if (node.$?.['android:name'] === NEARBY) {
        node.$['android:usesPermissionFlags'] = 'neverForLocation';
      }
    }
  }
  manifest['uses-permission'] = uses;
  return doc;
}

/**
 * @param {import('@expo/config-plugins').ExpoConfig} config
 */
module.exports = function withWifiSsidPermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    applyWifiSsidManifestPermissions(cfg.modResults);
    return cfg;
  });
};

module.exports.applyWifiSsidManifestPermissions = applyWifiSsidManifestPermissions;
