# Session lock

## WHAT THIS SECTION CONTROLS

Here you choose when the master password is asked again: on the phone and, separately, in the browser (web access). One control does not change the other. “Never” on either one requires biometrics or the master password.

## APP AUTO-LOCK (WHEN LEAVING)

- Instantly: leaving the app (home screen or another app) locks the vault. If the system never fully backgrounds the app (a very quick switch), it locks when you come back. System sheets (share, Face ID, permissions) do not lock it.
- 1 minute: if you leave for a minute or more, unlocking is required when you come back. That uses real elapsed time.
- Never: the phone does not lock by itself when you leave. You still need the password or biometrics to open the app if the session is not active.

## LOCK WHEN UNUSED

If you do not touch the app while it stays open, it locks after 1 / 5 / 15 minutes, or Never. This is independent of the background lock. “Never” also requires extra authentication.

## WEB ACCESS ON LOCK

On Android, if web access is on, locking the phone or leaving PKEY in the background does not turn the server off or lock the vault: the background notification stays so you can use the computer. Instantly and 1 minute do not run until you turn web access off or lock PKEY on purpose (Lock PKEY) or after unused time with the app open. iPhone cannot keep it running after lock; you can re-enable it when you come back.

## WEB AUTO-LOCK

5 min, 15 min, 1 hour, or Never. The clock keeps running if you change tabs. “Never” requires extra authentication.

## STRICTLY OFFLINE MODE

The vault stays off the network (LAN and Internet): turns off and hides web access, breach checks, and remote icons.

## IN SHORT

- App: auto-lock when leaving (Instantly / 1 minute / Never) and lock when unused (1 / 5 / 15 min / Never).
- LAN web access: on Android it stays on if you lock the phone, and the app does not auto-lock until you turn web access off or lock PKEY.
- Web: one inactivity clock.
- Never asks for extra authentication. The settings do not override each other.
