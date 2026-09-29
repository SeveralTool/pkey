# Getting started

PKEY is **source-available** for security audit. The official app is the store build. Do **not** use a self-built copy in production or republish it. See [LICENSE](../LICENSE) and [CONTRIBUTING.md](./CONTRIBUTING.md).

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | **22** (LTS; matches CI) |
| npm | 10+ (workspaces) |
| Git | Latest |
| Expo dev client / Android Studio | Only if you run the app on a device |

Optional: `ANDROID_HOME` / `ANDROID_SDK_ROOT` for a local debug APK. Copy [`.env.example`](../.env.example) if you need those paths. No cloud API keys exist.

## Install

```bash
git clone https://github.com/SeveralTool/pkey.git
cd pkey
npm ci
```

Packages are `"private": true` — they are not published to npm.

## Run (audit only)

```bash
npm run prebuild:mobile   # @pkey/core + PWA embed
npm start                 # Expo dev client (LAN, not tunnel)
```

Then press `a` for Android, or scan the QR with a **development build**. Expo Go is not enough for LAN web access, mDNS, or migration.

Standalone web client:

```bash
npm run build:core
npm run dev:web
```

## Tests

```bash
npm run test:core
npm test -- --watchAll=false --ci
npm run test:web
```

## Two GitHub repositories (maintainers)

| Repo | Visibility | Role |
|------|------------|------|
| `SeveralTool/pkey-dev` | Private | Day-to-day history, WIP |
| `SeveralTool/pkey` | Public | Canonical audit source. Same URLs as [legalContact.ts](../src/constants/legalContact.ts) |

Public history is a **clean snapshot** (no `pkey-dev` commits). Releases:

1. `npm run sync:public -- <path-to-public-clone>`
2. Commit on the **public** clone
3. `npm run stamp:integrity` on that public `HEAD` (so Settings matches GitHub)
4. `eas build --profile production --platform android` (run locally; not from the coding agent)
5. Publish SHA-256 on the public GitHub Release — [DEPLOYMENT.md](./DEPLOYMENT.md)

## Next

- [ARCHITECTURE.md](./ARCHITECTURE.md) — encryption and data flow
- [DEPLOYMENT.md](./DEPLOYMENT.md) — EAS, AAB, hashes
- [SECURITY.md](./SECURITY.md) — private vulnerability reports
