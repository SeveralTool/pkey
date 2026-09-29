# Scripts — Build and Validation

Node/TypeScript utilities that support the monorepo build pipeline and quality checks. Invoked via root `package.json`; not shipped inside the mobile runtime.

## Scripts

| Script | Invoked by | Role |
|--------|------------|------|
| `embed-pwa.mjs` | `npm run embed:pwa` | Embed Vite single-file HTML into `src/web/generated/pwaHtml.ts` and static icons/manifest into `pwaAssets.ts` |
| `embed-pwa.mjs` (+ web build) | `npm run refresh:pwa` | `build:web` then embed — use with Metro reload (no APK) |
| `generate-tab-icons.mjs` | `node scripts/generate-tab-icons.mjs` | White silhouette PNGs for Android native tab icons (`assets/images/tabs/`) |
| `generate-brand-icons.mjs` | `npm run generate:brand-icons` | Derive launcher, splash, notification, and PWA icons from the private brand master; committed outputs live in `assets/images/` |
| `build-apk.mjs` | `npm run build:apk` | If `pkey_v{code}.apk` exists, bump version → SDK props → Gradle debug APK → `builds/android/pkey_v{code}.apk` |
| `ensure-android-sdk.mjs` | Called by `build-apk.mjs` | Write `android/local.properties` `sdk.dir` |
| `generate-import-fixtures.ts` | `npm run generate:import-fixtures` | Regenerate importer `sample.*` + `expected.json` |
| `validate-otp.ts` | `npm run validate:otp` | Cross-check `@pkey/core` TOTP vs `otplib` |
| `check-core-purity.mjs` | `npm run check:core-purity` | Fail if `@pkey/core` source imports `react-native` or `expo-*` (comments ignored) |
| `generate-third-party-notices.mjs` | `npm run legal:notices` | Third-party license report for legal notices |
| `build-legal-site.mjs` | `npm run legal:site` | Static HTML in `legal-site/` for GitHub Pages |
| `sync-public-snapshot.mjs` | `npm run sync:public -- <dir>` | Copy a filtered audit tree to the public clone |
| `stampBuildIntegrity.ts` | `npm run stamp:integrity` | Writes commit + timestamp into `app.json` `extra.buildIntegrity` before a store AAB |
| `check-16kb-page-size.mjs` | `npm run check:16kb -- file.aab` | ELF 16 KB LOAD alignment for `.so` inside an AAB/APK |

Typical mobile prep:

```text
build:core → build:web → embed:pwa   (= prebuild:mobile)
```

Day-to-day PWA iteration with an installed dev-client:

```bash
npm run refresh:pwa   # then Metro reload + hard-refresh browser on :7392
```

## Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANDROID_HOME` | Optional | SDK path for APK builds |
| `ANDROID_SDK_ROOT` | Optional | Alternate SDK path |
| `CI` | Optional | Used by Playwright elsewhere |

See [`.env.example`](../.env.example).

## How to test locally

```bash
npm run build:web && npm run embed:pwa
npm run generate:import-fixtures
npm run test:core
npm run validate:otp
node --test scripts/check-16kb-page-size.test.mjs
# After a production AAB exists:
# npm run check:16kb -- path/to/PKEY.aab
# Optional — needs Android SDK
npm run build:apk
```

## Related

- Stub: [`scripts/README.md`](../scripts/README.md)
