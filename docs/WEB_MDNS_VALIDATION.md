# Web / mDNS validation (lab checklist)

Manual checks for LAN web access discovery. Automated Jest/Vitest cannot prove that a phone’s Bonjour/NSD announcement is visible to a given desktop browser.

PKEY publishes `_pkey-web._tcp.local.` with instance `pkey-android-<4>` / `pkey-iphone-<4>` via `react-native-zeroconf`. `/pkey/meta.mdnsHost` should be populated as soon as publish starts (optimistic hostname), not only after the `published` event.

## What to verify

1. Phone: enable **Use on the computer**. Confirm the green **Copy address** button copies `http://pkey-…local:7392` when mDNS is available.
2. Same Wi‑Fi, no guest isolation.
3. Paste that address in the browser. Unlock (password or unlock-on-phone).
4. Change the phone’s DHCP lease (reconnect Wi‑Fi) **without** reloading the PWA tab. The tab should return to “Connected” without asking the user to paste again (warm reconnect: `.local` probe, last IP, RFC1918 `/24` sweep with pairing secret).
5. Cold start: close the tab, paste an **old numeric** address that no longer belongs to the phone. Expected: the page does not load. Recovery: Copy address on the phone, open a **new** tab. Do not treat this as a product regression.

## Matrix (fill in on device)

| Client | `.local` opens | Numeric fallback | Warm reconnect after DHCP | Notes |
| --- | --- | --- | --- | --- |
| Windows 11 Chrome (Secure DNS on) | | | | DoH often skips `.local` |
| Windows 11 Chrome (Secure DNS off) | | | | |
| Windows 11 Edge | | | | |
| Windows 11 Firefox | | | | |
| macOS Safari | | | | First firewall Allow |
| macOS Chrome | | | | |
| Linux Chrome (no Avahi) | | | | |
| Linux Firefox (Avahi installed) | | | | |
| Android Chrome (phone as client) | | | | |
| iOS Safari (phone as client) | | | | |

## Publisher (phone)

| Master | Publish `/pkey/meta.mdnsHost` immediately | Notes |
| --- | --- | --- |
| Android (FG service on) | | |
| iOS (PKEY in foreground) | | Background TCP will die after grace |

## Pass / fail rules

- Fail if Copy address encodes only the numeric URL while `getPublishedHost()` is non-empty.
- Fail if `/pkey/meta` serves `mdnsHost: ''` for more than ~1s after web access is on and discovery is available.
- Fail if a warm reconnect after DHCP requires the user to paste again while the original tab stayed open **and** the pairing secret exists.
- Pass if Windows needs the “Did it not open?” numeric copy for the **first** visit.

## Follow-up (only if `.local` never resolves from any desktop)

Consider moving mDNS publish from `react-native-zeroconf` into `pkey-web-access` (Android NsdManager / iOS NetService) so an A/AAAA record is guaranteed. That does **not** fix Chrome DoH on Windows; keep the numeric fallback.

HTTPS on `:7392` and a Service Worker are **out of scope** until a helper can serve `https://127.0.0.1` (certificate warnings are worse than Copy address for non-technical users).
