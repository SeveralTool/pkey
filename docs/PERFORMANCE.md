# PKEY Performance Measurement

This document describes how to measure and guard performance for the mobile vault UI.

## React DevTools Profiler (development)

Use this protocol to validate card-editing improvements (Phase 1 metrics).

1. Build a release binary: `npx expo run:android --variant release` (or iOS equivalent).
2. Open React DevTools → **Profiler**.
3. Load a vault with **≥100 cards**, expand one card, type in a text field for ~5 seconds.
4. Record:
   - `CardsList` commit duration (target: **60–70% reduction** vs baseline)
   - Number of `CardItem` re-renders while typing in one card (target: **70% fewer** collapsed items)
5. Repeat 3 runs and average.

## Automated benchmarks

```bash
npm run perf
```

| Benchmark | Threshold | File |
|-----------|-----------|------|
| Parse 1000 import rows | <5s | `packages/core/.../ImportOrchestrator.test.ts` |
| Parallel icon enrichment (12 cards, mocked) | <200ms | `src/services/importIcons.test.ts` |
| JSON.stringify 1000 cards | <20ms | `src/services/storage.perf.test.ts` |

CI runs `perf-benchmarks` as an **informative** job (`continue-on-error: true`).

## SDK 56 migration baseline (2026-06)

Upgraded from Expo SDK 55 (RN 0.83.6) to SDK 56 (RN 0.85.3, React 19.2.3, Hermes V1).

| Check | Result (automated) |
|-------|-------------------|
| `@pkey/core` tests | 82 passed |
| Mobile Jest | 136 passed |
| Web Vitest | 5 passed |
| E2E Playwright | 4 passed |
| `npm run perf` | passed |
| Lint | 0 errors (warnings only) |
| `expo prebuild --clean` | OK |
| `newArchEnabled` / `hermesEnabled` | `true` in `android/gradle.properties` |
| Native modules | `pkey-web-access` (Expo autolink); `react-native-tcp-socket` / `react-native-zeroconf` (RN autolink, `android/` present) |

**Manual device checklist** (requires Android SDK + physical device):

1. Login / biometrics / **one** native Argon2id (password path)
2. Card CRUD + vault scroll with ≥100 cards
3. Sync WebSocket/TCP
4. Migration QR + TCP
5. Web Access + foreground service
6. Zeroconf discovery
7. Export / import

## Password unlock KDF (lab)

Do this on a **release** binary (not Metro). Times are around `deriveRootKey` only (`[kdf]` logs in `__DEV__`; in release, use logcat/`os_log` duration from `kdfMetrics` if a debug build is needed). Never log password, salt, or root.

| Check | Target |
|-------|--------|
| Argon2id JS 64 MiB in production | **0** |
| Derives per password attempt (ok or fail) | **1** |
| Flagship (e.g. S25 Ultra) p50 | **<1 s** (ideal 200–500 ms) |
| Mid-range p50 | **<2 s** |
| UI thread freeze during derive | none (native `AsyncFunction`) |
| Biometric unlock | no Argon2id |
| Android native AEAD | on after noble XChaCha vector via `decryptVault` |
| iOS native AEAD | off (JS XChaCha by design) |

Matrix: cold/warm × password ok/fail × Android/iOS. 5 repeats, report p50/p95.

### Phase 3 (libsodium/NDK) gate

Do **not** add a native `.so` unless this lab misses the SLA (flagship ≥1 s or mid-range ≥2 s) after a single BouncyCastle / phc-winner-argon2 derive. Any NDK path must pass `npm run check:16kb`.

### Phase 4 (parameter change) gate

Do **not** lower `m`/`t`/`p` defaults without the table above. Existing envelopes keep their header params. New-vault defaults only, with an explicit write-up.

Expected (not measured in CI): JS noble 64 MiB is tens of seconds to minutes; native Java/C should be sub-second to a few seconds.

## Roadmap (v2, production APM)

- Evaluate `@shopify/react-native-performance` or `expo-performance` for real-device render metrics.
- Optional dashboard for TTI, commit duration P95, and import duration in the field.

## Related changes (v1)

- Granular context hooks instead of `useAppContext` merge
- `CardItem` props + `React.memo` with stable `DatabaseContext` handlers via `dbRef`
- Lazy + debounced `zxcvbn` (300ms, expanded cards only)
- O(1) duplicate indices via `buildDuplicateIndices`
- Parallel icon import (`p-limit`, concurrency 6)
- Disk write debounce **600ms** + flush on background / logout
