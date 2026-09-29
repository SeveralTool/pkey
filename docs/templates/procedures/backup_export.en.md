# Backup and export

## WHAT THIS SECTION DOES

Here you can save an encrypted backup of your vault on the phone, or share keys as unencrypted CSV/JSON. `.pkey` files stay in PKEY’s Exports folder: they are not part of the open vault, and you can delete them when you no longer need them. CSV and JSON are not kept on the phone.

## WHAT EACH FORMAT INCLUDES

They are not equivalent. Choose according to whether you need a full PKEY restore or a handoff of logins to another app.

### `.pkey` (encrypted, restorable in PKEY)

- All keys: titles, usernames, passwords (every password stored on the key), seed phrases, notes, TOTP, tags, icons, and dates.
- Vault settings: theme, language, auto-lock, generator, grouping, HIBP, favicons, and similar.
- Per-key HIBP check status (if you used it).
- Sync metadata needed to restore PKEY as it was.
- Not included: biometric unlock, login history, or web clients. Those stay on the phone.

### JSON (unencrypted, keys only)

- Each full key in cleartext: secrets, TOTP (including algorithm/digits/period), icons, dates, tags, and HIBP.
- Does not include app settings or session/sync data.

### CSV (unencrypted, interoperable)

- Columns: title, type, username, password (current one, or seed words joined), link, notes, TOTP secret, and tags.
- Does not include icons, dates, previous passwords, extra TOTP parameters, HIBP, or settings.

## .PKEY FILE (RECOMMENDED)

The local file button creates an encrypted backup (`.pkey`). This is the safest copy to keep or restore later in PKEY.

1. Tap “Create local file (.pkey)”.
2. The app will ask for biometrics or your master password.
3. It saves the file under Exports and opens the share sheet (Drive, Files, etc.).
4. Store it somewhere you trust. To load it again, use Import / restore.

## DEVICE SECRET (OPTIONAL)

If it is off, a `.pkey` opens on another phone with the master password.

If you turn it on, the `.pkey` from this section (a copy of the vault file) will not open on another device without the recovery kit. Write down the code when the app shows it. The kit is not stored inside the file.

## UNENCRYPTED CSV AND JSON

CSV and JSON include passwords and secrets in cleartext. Use them only when you need to interoperate with another tool. PKEY does not save them: it only opens the share sheet. If you cancel, no copy remains on the phone.

- The vault must be unlocked and contain keys.
- The app will ask for confirmation, then biometrics or your master password.
- Any destination you pick (Drive, mail, Files) is your responsibility — anyone with that copy can read your secrets.

## EXPORT LIST AND STORAGE SPACE

Below the buttons you will see `.pkey` backups saved on this device, free space on the phone, and actions to share or delete each file.

- Export size is limited by free system storage (PKEY does not set its own quota).
- PKEY keeps at most 10 `.pkey` backups. Once you reach 10, you must delete the oldest file or another one before creating a new export.
- If you see the “limit reached” notice, pick “delete the oldest and continue” or review the list below. The app can automatically make room by removing the oldest export.
- If there is not enough space, the app will tell you: free up storage or delete old exports, then try again.

## RESTORING A .PKEY

To recover a `.pkey` backup, use the Import / restore section (not this export button). There you can pick the file and enter the master password it was encrypted with. If device secret was on when you exported, another phone also needs the recovery kit. Restore replaces keys and settings with those from the file.

## IN SHORT

- Full PKEY copy (keys + settings) → `.pkey`.
- One-off handoff to another app → CSV (basic columns) or JSON (full key); share only.
- Out of space or old exports → check free space and the list below.
