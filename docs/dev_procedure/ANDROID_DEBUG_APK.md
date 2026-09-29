# Android debug APK (Metro)

This process creates an installable Android development-client APK that connects to the local
Metro bundler. Use it when a change affects native Android assets or configuration, including
launcher, adaptive, splash, or notification icons. Native dashboard tabs (`react-native-screens` Tabs /
`@react-navigation/bottom-tabs`) also need a debug APK that was built with `react-native-screens` 4.25+.
PWA-only changes do not require an APK rebuild.

## Before building

1. `npm run build:apk` increments `expo.version`, `expo.android.versionCode`, root
   `package.json`, and `android/app/build.gradle` when `builds/android/pkey_v{versionCode}.apk`
   already exists, so a second build becomes v29 instead of overwriting v28. You can still bump
   those values yourself first; both must increase for Android to treat the APK as an update.
2. Regenerate source-based brand assets when the canonical logo changed:

   ```powershell
   npm run generate:brand-icons
   ```

3. Ensure the PWA is embedded in the mobile bundle:

   ```powershell
   npm run prebuild:mobile
   ```

## Build the APK

Synchronize the Android project from Expo configuration, then create the debug APK:

```powershell
$env:CI = '1'
npx expo prebuild --platform android
npm run build:apk
```

The output is:

```text
builds/android/pkey_v{versionCode}.apk
```

The build script also writes `pkey-{version}-debug.apk` and `pkey-debug.apk` as convenient
aliases for the current build.

## Retention policy

After each `npm run build:apk`, the script preserves only the three highest numbered APK files:

```text
pkey_v23.apk
pkey_v22.apk
pkey_v21.apk
```

Older numbered and semantic-versioned APK files are automatically removed. Legacy artifacts using
the old `pkey v{number}.apk` naming are also removed. The unnumbered `pkey-debug.apk` file always
points to the newest build.

## Install and use with Metro

1. Install `builds/android/pkey_v{versionCode}.apk` on the phone, replacing the older PKEY app.
2. Start Metro on the local network:

   ```powershell
   npx expo start --lan
   ```

3. Open PKEY on the phone. It will load the JavaScript bundle from Metro.

Use the same Wi-Fi network and do not use tunnels.
