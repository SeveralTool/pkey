# Audit setup

End users should install PKEY from the official store listing. **This page is not a product install guide.**

PKEY is **source-available** for security audit. The official app is the store build. You may clone and run the source in a private environment **only** to review it. Do **not** use a self-built copy in production or republish it. See [LICENSE](../LICENSE) and [CONTRIBUTING.md](./CONTRIBUTING.md).

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | **22** (LTS; matches CI) |
| npm | 10+ (workspaces) |
| Git | Latest |
| Expo dev client / Android Studio | Only if you run the app on a device |

Optional: `ANDROID_HOME` / `ANDROID_SDK_ROOT` for a local debug APK. Copy [`.env.example`](../.env.example) if you need those paths. No cloud API keys exist.

## Clone for audit

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

Public history is a **filtered snapshot** (runtime source and auditor docs; no `pkey-dev` WIP). Maintainer playbooks stay private.

## Next

- [ARCHITECTURE.md](./ARCHITECTURE.md) — encryption and data flow
- [SECURITY.md](./SECURITY.md) — private vulnerability reports
