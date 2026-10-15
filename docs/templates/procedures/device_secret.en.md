# Device secret

## WHAT IT IS

The device secret is optional and off by default. If you turn it on, the vault and every `.pkey` backup from this section are bound to this phone. A copied file will not open on another device with the master password alone: you also need the recovery kit.

## THE RECOVERY KIT

When you enable the switch, PKEY shows a code to write down or print. That code is the only copy you can take to another phone. It is not stored inside the `.pkey` and it is not shown again. PKEY cannot recover it.

## HOW TO TURN IT ON

1. Under Security → Backup and export, turn on Device secret.
2. Authenticate with biometrics or your master password.
3. Write down the code that appears and keep it apart from your backups, in a place only you control.

## HOW TO USE IT

- On this phone: the master password or biometrics still unlock. The secret stays in this device’s hardware.
- On another phone, when restoring a `.pkey` or after migration: you need the master password and the kit. After the password, PKEY asks for the kit; once the vault opens, it stores the secret in that phone's hardware and does not ask again.
- Changing the enrolled fingerprint or face on this phone does not disable the secret. If an older PKEY version lost it that way, unlock asks for the kit once.
- Unencrypted CSV and JSON do not use the kit either.

## IF YOU LOSE IT

Without the kit there is no way to open a bound `.pkey` on another device. If you no longer need this protection, turn the secret off on this phone (it asks for the master password again) and export a normal `.pkey`.
