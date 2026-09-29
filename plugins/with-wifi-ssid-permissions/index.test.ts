/**
 * @fileoverview Android manifest patch for SSID permissions (Play location policy).
 */
const { applyWifiSsidManifestPermissions } = require('./index.js') as {
  applyWifiSsidManifestPermissions: (doc: {
    manifest: { 'uses-permission': { $: Record<string, string> }[] };
  }) => unknown;
};

describe('applyWifiSsidManifestPermissions', () => {
  it('caps location to API 32 and adds nearby Wi-Fi neverForLocation', () => {
    const doc = {
      manifest: {
        'uses-permission': [
          { $: { 'android:name': 'android.permission.ACCESS_FINE_LOCATION' } },
          { $: { 'android:name': 'android.permission.ACCESS_COARSE_LOCATION' } },
        ],
      },
    };
    applyWifiSsidManifestPermissions(doc);
    const uses = doc.manifest['uses-permission'];
    expect(uses).toEqual(
      expect.arrayContaining([
        {
          $: {
            'android:name': 'android.permission.ACCESS_FINE_LOCATION',
            'android:maxSdkVersion': '32',
          },
        },
        {
          $: {
            'android:name': 'android.permission.ACCESS_COARSE_LOCATION',
            'android:maxSdkVersion': '32',
          },
        },
        {
          $: {
            'android:name': 'android.permission.NEARBY_WIFI_DEVICES',
            'android:usesPermissionFlags': 'neverForLocation',
          },
        },
      ])
    );
  });
});
