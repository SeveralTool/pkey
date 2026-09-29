# `pkey-web-access`

Expo native module for LAN web-access keep-alive:

- **Android:** sticky foreground service (minimal silent notification required by the OS) + port reclaim
- **iOS:** `UIBackgroundTask` grace period (no sticky local notification)

Product OS alert when a **new browser syncs** is fired from JS (`SyncContext`), not as a sticky status notification.

Full documentation: **[docs/NATIVE_MODULE_WEB_ACCESS.md](../../docs/NATIVE_MODULE_WEB_ACCESS.md)**.
