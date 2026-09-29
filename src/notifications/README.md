# `src/notifications`

In-app toast/alert **queue helpers** and OS notification APIs (`notificationRef`, `inAppNotifications`, `osNotificationService`, tap payload parsing). The React provider lives in `src/context/NotificationContext.tsx`; overlay UI lives in `src/components/notifications/` (isolated by `NotificationOverlayErrorBoundary`).

Prefer `notifications.alert` / `.toast` from `notificationRef` instead of blocking `Alert.alert` for vault flows.

OS product alerts:

- **Browser synced** — body tap → Security tab; **Block** action → bio or master password, then `blockClientIdentity` (source id and/or IP). In-app alert while `AppState` is `active` (auto-dismiss after 10s; Block remains available until then).
- **Web LAN address changed** — body tap → Security tab (new QR/URL). OS body has no IP or SSID; in-app alert may include the new URL. Fired when web access is on, no authenticated browser, and the phone’s LAN IP or Wi‑Fi changed.
- **Screenshot detected** — body tap → Settings tab.
- Android FG keep-alive is a separate silent ongoing notification (`pkey-web-access`), not this module.

Tap `data` is parsed with a guarded schema (string extras only). See **[docs/MOBILE_APP.md](../../docs/MOBILE_APP.md)**.
