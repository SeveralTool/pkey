# `src/screens`

No React Navigation. `App.tsx` shows `LoginScreen` or `DashboardScreen` from `isLogged`. Tabs are custom buttons in `DashboardScreen` driven by `UIContext.currentTab`:

- `CardsTab` — vault list
- `StatsTab` — health metrics
- `SecurityTab` — danger zone / exports
- `SettingsTab` — theme, generator, HIBP, web access

See **[docs/MOBILE_APP.md](../../docs/MOBILE_APP.md)**.
