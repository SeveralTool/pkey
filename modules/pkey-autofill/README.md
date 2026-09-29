# pkey-autofill

Android-only Expo module: system `AutofillService` + vault cache bridge.

While the vault is unlocked, the app writes a private JSON cache of login candidates
(`syncCache`). The service ranks by domain / package (same idea as
`matchLoginCandidates` in `@pkey/core`). On lock/logout the cache is cleared.

Enable in **Settings → Passwords & autofill → Autofill service → PKEY**.
