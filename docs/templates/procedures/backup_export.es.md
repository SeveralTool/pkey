# Respaldo y exportación

## QUÉ HACÉ ESTA SECCIÓN

Desde aquí podés guardar un respaldo cifrado de tu bóveda en el teléfono, o compartir las llaves en CSV/JSON sin cifrar. Los `.pkey` quedan en la carpeta Exports de PKEY: no forman parte de la bóveda abierta y podés borrarlos cuando ya no los necesites. CSV y JSON no se guardan en el teléfono.

## QUÉ INCLUYE CADA FORMATO

No son equivalentes. Elegí según si querés recuperar PKEY entero o pasar logins a otra app.

### `.pkey` (cifrado, restaurable en PKEY)

- Todas las llaves: títulos, usuarios, contraseñas (todas las de cada llave), frases semilla, notas, TOTP, etiquetas, iconos y fechas.
- Ajustes de la bóveda: tema, idioma, auto-bloqueo, generador, agrupación, HIBP, favicons, etc.
- Estado de verificación HIBP de cada llave (si lo usaste).
- Metadatos de sincronización necesarios para dejar PKEY como estaba.
- No incluye: desbloqueo biométrico, historial de inicios de sesión ni clientes web. Eso queda en el teléfono.

### JSON (sin cifrar, solo llaves)

- Cada llave completa en claro: secretos, TOTP (incluido algoritmo/dígitos/periodo), iconos, fechas, etiquetas e HIBP.
- No incluye ajustes de la app ni datos de sesión/sync.

### CSV (sin cifrar, interoperable)

- Columnas: título, tipo, usuario, contraseña (la actual, o las palabras de la seed juntas), enlace, notas, secreto TOTP y etiquetas.
- No incluye iconos, fechas, contraseñas anteriores, parámetros extra de TOTP, HIBP ni ajustes.

## ARCHIVO .PKEY (RECOMENDADO)

El botón de archivo local crea un respaldo cifrado (`.pkey`). Es la copia más segura para guardar o restaurar más adelante en PKEY.

1. Tocá «Crear archivo local (.pkey)».
2. La app pedirá biometría o contraseña maestra.
3. Guarda el archivo en Exports y abre el menú para compartirlo (Drive, Files, etc.).
4. Guardalo en un lugar de confianza. Para volver a cargarlo, usá Importar / restaurar.

## SECRETO DE DISPOSITIVO (OPCIONAL)

Si está apagado, un `.pkey` se abre en otro teléfono con la contraseña maestra.

Si lo activás, el `.pkey` de esta sección (copia del archivo de la bóveda) no abre en otro equipo sin el kit de recuperación. Anotá el código cuando la app lo muestre. El kit no viaja dentro del archivo.

## CSV Y JSON SIN CIFRAR

CSV y JSON incluyen contraseñas y secretos en texto claro. Úsalos solo si necesitás interoperar con otra herramienta. PKEY no los guarda: solo abre el menú para compartirlos. Si cancelás, no queda copia en el teléfono.

- La bóveda debe estar desbloqueada y tener llaves.
- La app te pedirá confirmación y luego biometría o contraseña maestra.
- Cualquier destino que elijas (Drive, mail, Archivos) queda bajo tu responsabilidad: cualquiera con esa copia puede leer tus secretos.

## LISTA DE EXPORTS Y ESPACIO

Debajo de los botones verás los respaldos `.pkey` guardados en este dispositivo, el espacio libre del teléfono y acciones para compartir o borrar cada archivo.

- El tamaño del export está limitado por el espacio libre del sistema (PKEY no impone una cuota propia).
- PKEY guarda como máximo 10 respaldos `.pkey`. Si llegás a 10, deberás borrar el más antiguo o algún otro para poder crear uno nuevo.
- Si no hay espacio suficiente, la app te lo avisará: liberá almacenamiento o borrá exports viejos e intentá de nuevo.
- Si hay muchos archivos, conviene limpiar los que ya no uses.

## RESTAURAR UN .PKEY

Para recuperar un backup `.pkey` usá la sección Importar / restaurar (no este botón de export). Ahí podés elegir el archivo y la contraseña maestra con la que se cifró. Si al exportar tenías el secreto de dispositivo activado, en otro teléfono también necesitás el kit de recuperación. Restaurar reemplaza llaves y ajustes por los de ese archivo.

## EN RESUMEN

- Copia completa de PKEY (llaves + ajustes) → `.pkey`.
- Intercambio puntual con otra app → CSV (columnas básicas) o JSON (llave completa); solo se comparte.
- Sin espacio o exports viejos → mirá el espacio libre y la lista debajo.
