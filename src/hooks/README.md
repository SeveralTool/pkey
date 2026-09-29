# `src/hooks`

Extracted mobile logic (keep contexts thin):

- `useBackgroundAutoLogout` — AppState + INSTANT resume lock + 1M wall-clock lock
- `useDebouncedVaultWrite` — encrypted disk flush (also `flushPendingDatabaseWrite`)
- `useScreenshotPolicy` — allow/block captures from settings
- `usePasswordGeneration` — CSPRNG generator from vault settings
- `useCardAnalysis` / `useIconDetection` / `useReducedMotion`

See **[docs/MOBILE_APP.md](../../docs/MOBILE_APP.md)**.
