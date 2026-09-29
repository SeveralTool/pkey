# Import and restore

## TWO DIFFERENT PATHS

Under Security you will see ways to bring data into PKEY. They are not the same:

- Restore a PKEY backup (.pkey file): reloads an encrypted copy made from this app. It restores keys and settings as you exported them (replacing what is on the phone).
- Import from another manager: brings passwords exported from Bitwarden, 1Password, Chrome, CSV, and similar, and turns them into PKEY keys.

## RESTORE A .PKEY FILE

1. Choose Import / restore backup.
2. Pick the .pkey file you saved earlier.
3. Enter that backup’s master password when asked.
4. Read the warning: restore can replace what is currently on this phone.

Use this when you want a full PKEY copy back (keys + settings, same master password). Biometrics are not in the `.pkey`: set them up again on the phone.

## DEVICE SECRET

If device secret was on when you exported, the master password alone is not enough on another phone: you also need the recovery kit you wrote down when you enabled it. On this phone the secret is already in hardware.

Without the kit the file will not open; it can look like the password is wrong. PKEY cannot recover a lost kit.

## IMPORT FROM OTHER MANAGERS

1. In the other manager, export your logins (JSON, CSV, or the format PKEY lists).
2. In PKEY, open the import wizard (Import from other managers).
3. Choose the file and, if needed, map columns (username, password, site…).
4. Confirm: new entries become keys. Check for duplicates afterward.

Accepted files: `.csv`, `.json`, `.txt`, `.1pif`, or a ZIP containing `.1pif`.

Common managers: Bitwarden JSON; NordPass/Enpass/Keeper JSON; Chrome/Firefox/LastPass/Dashlane/Keeper CSV; 1Password `.1pif` (or ZIP); generic CSV/TXT with mapping.

PDF, video, images, and other binaries are not imported — PKEY rejects them with a clear error.

Not supported: encrypted Bitwarden JSON and 1Password `.1pux` — export plaintext JSON/CSV or `.1pif` instead.

## IMPORTANT WARNINGS

- Restoring a .pkey can overwrite the current vault (keys and settings) — export first if you do not want to lose recent changes.
- Plain exports (CSV/JSON) are sensitive: delete them from the phone or PC when you are done.
- Import will not perfectly copy every feature from the other product; it focuses on username, password, URL, and notes.

## WHEN TO USE WHICH

- New phone and you have a .pkey → restore backup (and the kit if device secret was on).
- Moving from another password manager → import wizard.
- Regular safety copy → export a .pkey from Security and store it somewhere safe.
