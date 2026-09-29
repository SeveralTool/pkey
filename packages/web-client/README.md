# `@pkey/web-client`

Solid.js PWA unlocked against the phone on the **local LAN** (WebSocket + encrypted channel). Offline vault can stay in IndexedDB after a successful session.

- Store: `src/state/appStore.ts` (sync, login, cards). Helpers: `outbox`, `offlineVault`, `discovery`, `sweep`.
- UI: login / vault / card modal. Render errors: `AppErrorBoundary`.
- Password generation uses `@pkey/core` (`generateRandomPassword`).

```bash
npm run build:core
npm run dev:web
npm run test:web
```

See **[docs/WEB_CLIENT.md](../../docs/WEB_CLIENT.md)**. License: root [LICENSE](../../LICENSE).
