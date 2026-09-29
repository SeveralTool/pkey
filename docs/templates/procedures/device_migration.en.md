# Device migration

## WHAT IT IS FOR

Migration copies your encrypted vault from one phone to another over the local network (Wi‑Fi or similar). It does not upload your data to a PKEY cloud — the transfer is between your devices on your network.

## BEFORE YOU START

- Both phones need PKEY installed (a build that includes native migration).
- They should be on the same trusted Wi‑Fi or local network.
- Have your master password ready: the new phone will need it to unlock the received vault.
- If you turned on the device secret, have the recovery kit as well. Without it the new phone cannot open the vault.
- On the old phone, the vault must be unlocked before you can send.

## HOW TO SEND FROM YOUR CURRENT PHONE

1. Open Security → Device migration.
2. Choose Send vault (or the matching button).
3. Follow the on-screen steps: the phone will show a code or QR to pair.
4. Keep both apps open and the screens awake until it finishes.

## HOW TO RECEIVE ON THE NEW PHONE

1. On the new phone, open Migration → Receive (you can also start from the login screen if you do not have a vault yet).
2. Scan the code or enter the pairing shown on the sending phone.
3. When the transfer completes, unlock with your master password. If the device secret was on, the new phone also needs the recovery kit.

## TIPS

- If it fails, check that both devices are on the same network and that router “client isolation” is not blocking phones from seeing each other.
- After a successful migration, you can keep using the old phone or clear the vault there later (that is a separate choice under Danger zone).
- Migration is not a file backup: if you want an export file, use Export / backup as well.
