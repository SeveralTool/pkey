# Accessibility manual checklist

Complement to the automated axe-core smoke run in [`packages/web-client/e2e/a11y.spec.ts`](../packages/web-client/e2e/a11y.spec.ts). This document tracks the manual passes that must be re-run each release across:

- **iOS + VoiceOver** (physical device, latest iOS)
- **Android + TalkBack** (physical device, latest Android)
- **Desktop keyboard-only** (PWA, Firefox + Chromium + Safari)

Mark each row per platform: **P** pass, **F** fail (open GitHub Security Advisory or issue with details), **N/A** not applicable.

## Critical flows (release blockers)

| Flow | iOS VO | Android TB | Keyboard | Notes |
|------|--------|------------|----------|-------|
| Create session (new vault) | | | | Password field must announce strength changes |
| Unlock with master password | | | | Focus lands on password input; error announced on wrong password |
| Unlock with biometrics (fast path) | | | N/A | Skip prompt with cancel; keyboard focus returns cleanly |
| Card list scroll | | | | 100+ cards; row focus does not jump |
| Expand card / reveal password | | | | 30 s auto-hide announced; timer visible for sighted users |
| Copy password (with new clipboard countdown) | | | | Auto-clear toast is announced |
| Edit + save card | | | | Save button state (`idle`/`saving`/`saved`) announced |
| Delete card (swipe / long-press) | | | | Confirm dialog reachable without gestures |
| Import wizard (mapping step) | | | | Column header table is navigable |
| Export encrypted backup | | | | Biometric gate is announced |
| Danger zone: reset session | | | | Double confirmation reachable |
| Web access enable / disable | | | | Foreground status announced |
| Migration send / receive | | | | Fingerprint comparison must be reachable and copyable |

## Widget-level checks

| Widget | iOS VO | Android TB | Keyboard | Notes |
|--------|--------|------------|----------|-------|
| Password strength bar | | | | Announce label + percentage |
| OTP countdown | | | | Announce remaining seconds every 5 s |
| Toast notifications | | | | Toast text is announced; auto-clear does not steal focus |
| Dashboard native tabs | | | N/A | Four destinations announced; selected state; no collapse to a single icon |
| Custom prompt modal | | | | Focus trap active; Escape closes |
| Icon picker | | | | Grid navigable arrow keys / swipe |
| Tag chips editor | | | | Each chip has remove label with tag name |
| Web sync clients list | | | | Block / unblock actions reachable |

## Contrast (WCAG 2.2 AA)

Run against the light and dark themes:

| Token | Expected ratio ≥ | Auto-check | Manual verification |
|-------|-----------------|------------|---------------------|
| `c.text` on `c.bg` | 7:1 (AAA text) | axe-core | eyes |
| `c.textMuted` on `c.bg` | 4.5:1 | axe-core | eyes |
| `c.accent` on white | 4.5:1 (button labels) | | eyes |
| `c.danger` on `c.bg` | 4.5:1 | | eyes |
| `c.success` on `c.bg` | 4.5:1 | | eyes |

## Motion & reduced motion

- iOS "Reduce Motion" on → card expand animation must be instant.
- Android "Remove animations" on → same.
- No parallax / autoplay carousels.

## Signoff

| Release | Reviewer | Date | Result |
|---------|----------|------|--------|
| | | | |
