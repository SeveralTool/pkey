# Importar y restaurar

## DOS CAMINOS DISTINTOS

En Seguridad verás opciones para traer datos a PKEY. No son lo mismo:

- Restaurar un backup de PKEY (archivo .pkey): vuelve a cargar una copia cifrada hecha desde esta app. Recupera llaves y ajustes tal como los exportaste (reemplaza lo que hay en el teléfono).
- Importar desde otro gestor: trae contraseñas exportadas de Bitwarden, 1Password, Chrome, CSV, etc., y las convierte en llaves de PKEY.

## RESTAURAR UN ARCHIVO .PKEY

1. Elige la opción de importar / restaurar backup.
2. Selecciona el archivo .pkey que guardaste antes.
3. Introduce la contraseña maestra de ese backup cuando se pida.
4. Revisa el aviso: restaurar puede reemplazar lo que hay ahora en el teléfono.

Usa esto cuando quieras recuperar una copia completa de PKEY (llaves + ajustes, misma clave). La biometría no viaja en el `.pkey`: hay que configurarla de nuevo en el teléfono.

## SECRETO DE DISPOSITIVO

Si al exportar tenías el secreto de dispositivo activado, la contraseña maestra sola no alcanza en otro teléfono: necesitás también el kit de recuperación que anotaste al activarlo. En este teléfono el secreto ya está en el hardware.

Sin el kit el archivo no se abre; puede parecer que la contraseña está mal. PKEY no puede recuperar un kit perdido.

## IMPORTAR DESDE OTROS GESTORES

1. En el otro gestor, exporta tus logins (JSON, CSV u el formato que indique PKEY).
2. En PKEY, abre el asistente de importación (Importar desde otros gestores).
3. Elige el archivo y, si hace falta, mapea las columnas (usuario, contraseña, sitio…).
4. Confirma: las entradas nuevas se añaden como llaves. Revisa duplicados después.

Archivos aceptados: `.csv`, `.json`, `.txt`, `.1pif` o ZIP con `.1pif`.

Gestores habituales: Bitwarden JSON; NordPass/Enpass/Keeper JSON; Chrome/Firefox/LastPass/Dashlane/Keeper CSV; 1Password `.1pif` (o ZIP); CSV/TXT genérico con mapeo.

PDF, vídeo, imágenes y otros binarios no se importan: PKEY los rechaza con un error claro.

No soportados: Bitwarden JSON cifrado y 1Password `.1pux` — exportá en JSON/CSV en claro o `.1pif`.

## ADVERTENCIAS IMPORTANTES

- Un restore de .pkey puede sobrescribir la bóveda actual (llaves y ajustes): exporta antes si no quieres perder cambios recientes.
- Los export “en claro” (CSV/JSON) son sensibles: bórralos del teléfono o del PC cuando termines.
- Importar no copia historial perfecto ni ajustes del otro producto: prioriza usuario, contraseña, URL y notas.

## CUÁNDO USAR CADA UNO

- Cambias de teléfono y tienes .pkey → restaurar backup (y el kit si el secreto de dispositivo estaba activo).
- Vienes de otro password manager → asistente de importación.
- Quieres una copia de seguridad periódica → exporta .pkey desde Seguridad y guárdala en un lugar seguro.
