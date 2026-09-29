# `src` — Mobile app

React Native + Expo (dev client, LAN Metro only). Domain types and crypto live in `@pkey/core`. The LAN PWA is built from `packages/web-client` and served from the phone when web access is on.

Start: `npm start` → `expo start --dev-client`. Tests: Jest under `src/`.

Layout: `bootstrap/`, `context/` (all React providers), `navigation/` (native dashboard tabs), `screens/`, `hooks/`, `services/`, `notifications/` (queue + OS helpers), `components/` (including notification overlay UI), `web/`, `styles/`.

See **[docs/MOBILE_APP.md](../docs/MOBILE_APP.md)** and **[docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)**.
