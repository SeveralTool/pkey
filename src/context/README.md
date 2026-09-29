# `src/context`

React providers for session, vault, settings, in-app notifications, LAN sync, and device migration.

| Provider | Role |
| --- | --- |
| `CoreStateContext` | Shared in-memory vault + login form state |
| `UIContext` | Dashboard tab + expanded card (nested under CoreState; Auth/Database/Sync consume its setters) |
| `AuthContext` | Create/unlock/logout; biometric re-auth; vault upgrade on unlock |
| `DatabaseContext` | Card CRUD, import, HIBP, debounced encrypted writes |
| `SettingsContext` | Theme, locale, generator toggles |
| `NotificationContext` | In-app toast/alert queue + OS notification API (`useNotifications`) |
| `SyncContext` | LAN web-access server for the PWA |
| `MigrationContext` | One-shot device-to-device vault move |

Auto-logout on background uses wall-clock resume (`useBackgroundAutoLogout`; INSTANT also locks on resume after `inactive` if `background` never fired). Pairing secrets live in SecureStore, not AsyncStorage.

See **[docs/MOBILE_APP.md](../../docs/MOBILE_APP.md)**.
