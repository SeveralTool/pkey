import type { ProcedureDoc } from './types';

export const importRestoreProcedure: ProcedureDoc = {
  id: 'import_restore',
  title: {
    ESP: 'Importar y restaurar',
    ING: 'Import and restore',
  },
  body: {
    ESP: `DOS CAMINOS DISTINTOS

En Seguridad verás opciones para traer datos a PKEY. No son lo mismo:

• Restaurar un backup de PKEY (archivo .pkey): vuelve a cargar una copia cifrada hecha desde esta app. Recupera llaves y ajustes tal como los exportaste (reemplaza lo que hay en el teléfono).
• Importar desde otro gestor: trae contraseñas exportadas de Bitwarden, 1Password, Chrome, CSV, etc., y las convierte en llaves de PKEY.

RESTAURAR UN ARCHIVO .PKEY

1. Elige la opción de importar / restaurar backup.
2. Selecciona el archivo .pkey que guardaste antes.
3. Introduce la contraseña maestra de ese backup cuando se pida.
4. Revisa el aviso: restaurar puede reemplazar lo que hay ahora en el teléfono.

Usa esto cuando quieras recuperar una copia completa de PKEY (llaves + ajustes, misma clave). La biometría no viaja en el .pkey: hay que configurarla de nuevo en el teléfono.

SECRETO DE DISPOSITIVO

Si al exportar tenías el secreto de dispositivo activado, la contraseña maestra sola no alcanza en otro teléfono: necesitás también el kit de recuperación que anotaste al activarlo. En este teléfono el secreto ya está en el hardware.

Sin el kit el archivo no se abre; puede parecer que la contraseña está mal. PKEY no puede recuperar un kit perdido.

IMPORTAR DESDE OTROS GESTORES

1. En el otro gestor, exporta tus logins (JSON, CSV u el formato que indique PKEY).
2. En PKEY, abre el asistente de importación (Importar desde otros gestores).
3. Elige el archivo y, si hace falta, mapea las columnas (usuario, contraseña, sitio…).
4. Confirma: las entradas nuevas se añaden como llaves. Revisa duplicados después.

Archivos aceptados: .csv, .json, .txt, .1pif o ZIP con .1pif.
Gestores habituales: Bitwarden JSON; NordPass/Enpass/Keeper JSON; Chrome/Firefox/LastPass/Dashlane/Keeper CSV; 1Password .1pif (o ZIP); CSV/TXT genérico con mapeo.
PDF, vídeo, imágenes y otros binarios no se importan: PKEY los rechaza con un error claro.
No soportados: Bitwarden JSON cifrado y 1Password .1pux — exportá en JSON/CSV en claro o .1pif.

ADVERTENCIAS IMPORTANTES

• Un restore de .pkey puede sobrescribir la bóveda actual (llaves y ajustes): exporta antes si no quieres perder cambios recientes.
• Los export “en claro” (CSV/JSON) son sensibles: bórralos del teléfono o del PC cuando termines.
• Importar no copia historial perfecto ni ajustes del otro producto: prioriza usuario, contraseña, URL y notas.

CUÁNDO USAR CADA UNO

• Cambias de teléfono y tienes .pkey → restaurar backup (y el kit si el secreto de dispositivo estaba activo).
• Vienes de otro password manager → asistente de importación.
• Quieres una copia de seguridad periódica → exporta .pkey desde Seguridad y guárdala en un lugar seguro.`,
    ING: `TWO DIFFERENT PATHS

Under Security you will see ways to bring data into PKEY. They are not the same:

• Restore a PKEY backup (.pkey file): reloads an encrypted copy made from this app. It restores keys and settings as you exported them (replacing what is on the phone).
• Import from another manager: brings passwords exported from Bitwarden, 1Password, Chrome, CSV, and similar, and turns them into PKEY keys.

RESTORE A .PKEY FILE

1. Choose Import / restore backup.
2. Pick the .pkey file you saved earlier.
3. Enter that backup’s master password when asked.
4. Read the warning: restore can replace what is currently on this phone.

Use this when you want a full PKEY copy back (keys + settings, same master password). Biometrics are not in the .pkey: set them up again on the phone.

DEVICE SECRET

If device secret was on when you exported, the master password alone is not enough on another phone: you also need the recovery kit you wrote down when you enabled it. On this phone the secret is already in hardware.

Without the kit the file will not open; it can look like the password is wrong. PKEY cannot recover a lost kit.

IMPORT FROM OTHER MANAGERS

1. In the other manager, export your logins (JSON, CSV, or the format PKEY lists).
2. In PKEY, open the import wizard (Import from other managers).
3. Choose the file and, if needed, map columns (username, password, site…).
4. Confirm: new entries become keys. Check for duplicates afterward.

Accepted files: .csv, .json, .txt, .1pif, or a ZIP containing .1pif.
Common managers: Bitwarden JSON; NordPass/Enpass/Keeper JSON; Chrome/Firefox/LastPass/Dashlane/Keeper CSV; 1Password .1pif (or ZIP); generic CSV/TXT with mapping.
PDF, video, images, and other binaries are not imported — PKEY rejects them with a clear error.
Not supported: encrypted Bitwarden JSON and 1Password .1pux — export plaintext JSON/CSV or .1pif instead.

IMPORTANT WARNINGS

• Restoring a .pkey can overwrite the current vault (keys and settings) — export first if you do not want to lose recent changes.
• Plain exports (CSV/JSON) are sensitive: delete them from the phone or PC when you are done.
• Import will not perfectly copy every feature from the other product; it focuses on username, password, URL, and notes.

WHEN TO USE WHICH

• New phone and you have a .pkey → restore backup (and the kit if device secret was on).
• Moving from another password manager → import wizard.
• Regular safety copy → export a .pkey from Security and store it somewhere safe.`,
  },
};
