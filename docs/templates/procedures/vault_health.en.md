# Vault health

## WHAT IT IS

The health score summarizes, as a number from 0 to 100, how secure your vault looks right now. Higher means fewer obvious risks; lower means some keys deserve a closer look.

## WHAT IT LOOKS AT

The app checks several signals on your password-type keys (and, for some checks, across all keys):

- Reused passwords: the same password on more than one site.
- Weak passwords: keys that are too short or easy to guess.
- Stale keys: not updated in more than 90 days.
- Missing two-factor (2FA/OTP): password logins without a one-time code set up.
- Empty passwords: login entries with no password saved.

Each issue lowers the score a bit. You do not need the math: if the number drops, one of those situations is showing up in your vault.

## HOW TO IMPROVE IT

1. In Stats, tap metrics that show a warning (for example weak or reused passwords) to open those keys.
2. Replace weak or reused passwords with stronger, unique ones.
3. Update older keys when you change a password on the real site.
4. Turn on 2FA for important sites and save the OTP secret on the key.
5. Fill in any blank passwords you left empty.

The score updates automatically when you save changes. The goal is not a perfect 100 at all costs — it is fewer real risks in daily use.
