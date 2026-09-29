import type { ProcedureDoc } from './types';

export const backupExportProcedure: ProcedureDoc = {
  id: 'backup_export',
  title: {
    ESP: 'Respaldo y exportación',
    ING: 'Backup and export',
  },
  body: {
    ESP: `QUÉ HACÉ ESTA SECCIÓN

Desde aquí podés guardar un respaldo cifrado de tu bóveda en el teléfono, o compartir las llaves en CSV/JSON sin cifrar. Los .pkey quedan en la carpeta Exports de PKEY: no forman parte de la bóveda abierta y podés borrarlos cuando ya no los necesites. CSV y JSON no se guardan en el teléfono.

QUÉ INCLUYE CADA FORMATO

No son equivalentes. Elegí según si querés recuperar PKEY entero o pasar logins a otra app.

.pkey (cifrado, restaurable en PKEY)
• Todas las llaves: títulos, usuarios, contraseñas (todas las de cada llave), frases semilla, notas, TOTP, etiquetas, iconos y fechas.
• Ajustes de la bóveda: tema, idioma, auto-bloqueo, generador, agrupación, HIBP, favicons, etc.
• Estado de verificación HIBP de cada llave (si lo usaste).
• Metadatos de sincronización necesarios para dejar PKEY como estaba.
• No incluye: desbloqueo biométrico, historial de inicios de sesión ni clientes web. Eso queda en el teléfono.

JSON (sin cifrar, solo llaves)
• Cada llave completa en claro: secretos, TOTP (incluido algoritmo/dígitos/periodo), iconos, fechas, etiquetas e HIBP.
• No incluye ajustes de la app ni datos de sesión/sync.

CSV (sin cifrar, interoperable)
• Columnas: título, tipo, usuario, contraseña (la actual, o las palabras de la seed juntas), enlace, notas, secreto TOTP y etiquetas.
• No incluye iconos, fechas, contraseñas anteriores, parámetros extra de TOTP, HIBP ni ajustes.

ARCHIVO .PKEY (RECOMENDADO)

El botón de archivo local crea un respaldo cifrado (.pkey). Es la copia más segura para guardar o restaurar más adelante en PKEY.

1. Tocá «Crear archivo local (.pkey)».
2. La app pedirá biometría o contraseña maestra.
3. Guarda el archivo en Exports y abre el menú para compartirlo (Drive, Files, etc.).
4. Guardalo en un lugar de confianza. Para volver a cargarlo, usá Importar / restaurar.

SECRETO DE DISPOSITIVO (OPCIONAL)

Si está apagado, un .pkey se abre en otro teléfono con la contraseña maestra.

Si lo activás, el .pkey de esta sección (copia del archivo de la bóveda) no abre en otro equipo sin el kit de recuperación. Anotá el código cuando la app lo muestre. El kit no viaja dentro del archivo.

CSV Y JSON SIN CIFRAR

CSV y JSON incluyen contraseñas y secretos en texto claro. Úsalos solo si necesitás interoperar con otra herramienta. PKEY no los guarda: solo abre el menú para compartirlos. Si cancelás, no queda copia en el teléfono.

• La bóveda debe estar desbloqueada y tener llaves.
• La app te pedirá confirmación y luego biometría o contraseña maestra.
• Cualquier destino que elijas (Drive, mail, Archivos) queda bajo tu responsabilidad: cualquiera con esa copia puede leer tus secretos.

LISTA DE EXPORTS Y ESPACIO

Debajo de los botones verás los respaldos .pkey guardados en este dispositivo, el espacio libre del teléfono y acciones para compartir o borrar cada archivo.

• El tamaño del export está limitado por el espacio libre del sistema (PKEY no impone una cuota propia).
• PKEY guarda como máximo 10 respaldos .pkey. Si llegás a 10, deberás borrar el más antiguo o algún otro para poder crear uno nuevo.
• Si aparece el aviso de «máximo alcanzado», elegí «borrar el más antiguo y continuar» y la app creará el nuevo export automáticamente.
• Si no hay espacio suficiente, la app te lo avisará: liberá almacenamiento o borrá exports viejos e intentá de nuevo.

RESTAURAR UN .PKEY

Para recuperar un backup .pkey usá la sección Importar / restaurar (no este botón de export). Ahí podés elegir el archivo y la contraseña maestra con la que se cifró. Si al exportar tenías el secreto de dispositivo activado, en otro teléfono también necesitás el kit de recuperación. Restaurar reemplaza llaves y ajustes por los de ese archivo.

EN RESUMEN

• Copia completa de PKEY (llaves + ajustes) → .pkey.
• Intercambio puntual con otra app → CSV (columnas básicas) o JSON (llave completa); solo se comparte.
• Sin espacio o exports viejos → mirá el espacio libre y la lista debajo.`,
    ING: `WHAT THIS SECTION DOES

Here you can save an encrypted backup of your vault on the phone, or share keys as unencrypted CSV/JSON. .pkey files stay in PKEY’s Exports folder: they are not part of the open vault, and you can delete them when you no longer need them. CSV and JSON are not kept on the phone.

WHAT EACH FORMAT INCLUDES

They are not equivalent. Choose according to whether you need a full PKEY restore or a handoff of logins to another app.

.pkey (encrypted, restorable in PKEY)
• All keys: titles, usernames, passwords (every password stored on the key), seed phrases, notes, TOTP, tags, icons, and dates.
• Vault settings: theme, language, auto-lock, generator, grouping, HIBP, favicons, and similar.
• Per-key HIBP check status (if you used it).
• Sync metadata needed to restore PKEY as it was.
• Not included: biometric unlock, login history, or web clients. Those stay on the phone.

JSON (unencrypted, keys only)
• Each full key in cleartext: secrets, TOTP (including algorithm/digits/period), icons, dates, tags, and HIBP.
• Does not include app settings or session/sync data.

CSV (unencrypted, interoperable)
• Columns: title, type, username, password (current one, or seed words joined), link, notes, TOTP secret, and tags.
• Does not include icons, dates, previous passwords, extra TOTP parameters, HIBP, or settings.

.PKEY FILE (RECOMMENDED)

The local file button creates an encrypted backup (.pkey). This is the safest copy to keep or restore later in PKEY.

1. Tap “Create local file (.pkey)”.
2. The app will ask for biometrics or your master password.
3. It saves the file under Exports and opens the share sheet (Drive, Files, etc.).
4. Store it somewhere you trust. To load it again, use Import / restore.

DEVICE SECRET (OPTIONAL)

If it is off, a .pkey opens on another phone with the master password.

If you turn it on, the .pkey from this section (a copy of the vault file) will not open on another device without the recovery kit. Write down the code when the app shows it. The kit is not stored inside the file.

UNENCRYPTED CSV AND JSON

CSV and JSON include passwords and secrets in cleartext. Use them only when you need to interoperate with another tool. PKEY does not save them: it only opens the share sheet. If you cancel, no copy remains on the phone.

• The vault must be unlocked and contain keys.
• The app will ask for confirmation, then biometrics or your master password.
• Any destination you pick (Drive, mail, Files) is your responsibility — anyone with that copy can read your secrets.

EXPORT LIST AND STORAGE SPACE

Below the buttons you will see .pkey backups saved on this device, free space on the phone, and actions to share or delete each file.

• Export size is limited by free system storage (PKEY does not set its own quota).
• PKEY keeps at most 10 .pkey backups. Once you reach 10, you must delete the oldest file or another one before creating a new export.
• If you see the “limit reached” notice, pick “delete the oldest and continue” and the app will create the new export automatically.
• If there is not enough space, the app will tell you: free up storage or delete old exports, then try again.

RESTORING A .PKEY

To recover a .pkey backup, use the Import / restore section (not this export button). There you can pick the file and enter the master password it was encrypted with. If device secret was on when you exported, another phone also needs the recovery kit. Restore replaces keys and settings with those from the file.

IN SHORT

• Full PKEY copy (keys + settings) → .pkey.
• One-off handoff to another app → CSV (basic columns) or JSON (full key); share only.
• Out of space or old exports → check free space and the list below.`,
  },
};
