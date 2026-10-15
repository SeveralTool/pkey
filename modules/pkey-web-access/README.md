# `pkey-web-access`

Expo native module for LAN web-access keep-alive, plus the Android process hold for 1-minute auto-backup:

- **Android:** foreground service for `:7392` while PKEY stays in recents (minimal silent notification required by the OS) + port reclaim. Swiping the app away stops that service. Separate `dataSync` service `BackupKeepAliveService` while auto-backup is set to 1 minute, so the JS timer is not frozen after leaving PKEY. It does not open the LAN port. Swiping away stops it too.
- **iOS:** `UIBackgroundTask` grace period (no sticky local notification). No 1-minute backup keep-alive.

Product OS alert when a **new browser syncs** is fired from JS (`SyncContext`), not as a sticky status notification.

Full documentation: **[docs/NATIVE_MODULE_WEB_ACCESS.md](../../docs/NATIVE_MODULE_WEB_ACCESS.md)**.
