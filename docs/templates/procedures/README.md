# User help procedures (templates)

Human-readable mirrors of the in-app help articles shown when the user taps the help icon next to certain section titles in the **mobile** app (Stats / Security / Settings) and next to the master-password field on create-session.

## Runtime source of truth

The app loads TypeScript modules under [`src/constants/procedures/`](../../../src/constants/procedures/). Keep these markdown files aligned when you edit copy.

## Naming

| Procedure id | Files |
|--------------|--------|
| `vault_health` | `vault_health.es.md`, `vault_health.en.md` |
| `web_access` | `web_access.es.md`, `web_access.en.md` |
| `session_lock` | `session_lock.es.md`, `session_lock.en.md` |
| `device_migration` | `device_migration.es.md`, `device_migration.en.md` |
| `backup_export` | `backup_export.es.md`, `backup_export.en.md` |
| `import_restore` | `import_restore.es.md`, `import_restore.en.md` |
| `device_secret` | `device_secret.es.md`, `device_secret.en.md` |
| `danger_zone` | `danger_zone.es.md`, `danger_zone.en.md` |
| `master_password` | `master_password.es.md`, `master_password.en.md` |

## Tone

- End-user language only (no API names, no implementation details).
- Short headings in ALL CAPS match the in-app paragraph splitter.
- Numbered steps for processes (migration, import).
- Spanish and English are both authoritative for their locale.

## Mobile only

These procedures are not shown in the LAN web client / PWA.
