# Android manifest snapshot (prebuild evidence)

This file records the **intended** security-relevant bits of the generated `AndroidManifest.xml`. Expo does not commit `android/` in this repo; after `npx expo prebuild` compare the generated file to this snapshot.

Captured against `app.json` + config plugins (Fase 0 baseline, updated by the backup plugin in Fase 3).

## Application flags

| Attribute | Expected | Source |
|-----------|----------|--------|
| `android:usesCleartextTraffic` | `false` | `expo-build-properties` + `plugins/with-network-security-config` |
| `android:networkSecurityConfig` | `@xml/network_security_config` | `plugins/with-network-security-config` |
| `android:allowBackup` | `false` | `plugins/with-backup-rules` |
| `android:fullBackupContent` | `@xml/pkey_backup_rules` (optional, API < 31) | `plugins/with-backup-rules` |
| `android:dataExtractionRules` | `@xml/pkey_data_extraction_rules` | `plugins/with-backup-rules` |

## Network security config (release)

`base-config cleartextTrafficPermitted="true"` remains because Android cannot match RFC-1918 CIDR in `<domain>` tags. Application-layer envelopes still encrypt vault payloads. Debug overlays also trust user CAs for Metro — never ship `assembleDebug` as a store artifact.

## How to refresh

```bash
npx expo prebuild --platform android --no-install
# then diff android/app/src/main/AndroidManifest.xml against this table
```
