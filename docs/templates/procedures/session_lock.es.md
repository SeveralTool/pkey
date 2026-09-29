# Cierre de sesión

## QUÉ CONTROLA ESTA SECCIÓN

Acá se elige cuándo se vuelve a pedir la contraseña maestra: en el teléfono y, por separado, en el navegador (acceso web). Un control no cambia el otro. «Nunca» en cualquiera de los dos pide biometría o la contraseña maestra.

## AUTOBLOQUEO DE LA APP (AL SALIR)

- Inmediatamente: al salir de la app (inicio u otra app) la bóveda se bloquea. Si el sistema no llega a pasar a segundo plano (cambio muy rápido), se bloquea al volver. No se bloquea por hojas del sistema (compartir, Face ID, permisos).
- 1 minuto: si dejás la app un minuto o más, al volver pide desbloqueo. El tiempo es de reloj real.
- Nunca: el teléfono no bloquea solo al salir. Seguís necesitando contraseña o biometría al abrir la app si la sesión no está activa.

## BLOQUEO POR INACTIVIDAD

Si no tocás la app mientras está abierta, se bloquea según 1 / 5 / 15 minutos o Nunca. Es independiente del bloqueo al salir. «Nunca» también pide autenticación extra.

## ACCESO WEB AL BLOQUEAR

En Android, si el acceso web está activo, bloquear el teléfono o dejar PKEY en segundo plano no apaga el servidor ni bloquea la bóveda: sigue con la notificación de segundo plano para usarlo en la computadora. «Inmediatamente» y «1 minuto» no corren hasta que apagues el acceso web o bloquees PKEY a propósito («Cerrar sesión») o por inactividad con la app abierta. En iPhone el sistema no puede mantenerlo al bloquear; al volver se puede reactivar.

## AUTOBLOQUEO WEB

5 min, 15 min, 1 hora o Nunca. El reloj corre aunque cambies de pestaña. «Nunca» pide autenticación extra.

## MODO ESTRICTAMENTE OFFLINE

La bóveda no sale a la red (ni LAN ni Internet): apaga y oculta el acceso web, la comprobación de filtraciones y los iconos remotos.

## EN RESUMEN

- App: autobloqueo al salir (Inmediatamente / 1 minuto / Nunca) y bloqueo por inactividad (1 / 5 / 15 min / Nunca).
- Acceso web LAN: en Android sigue si bloqueás el teléfono, y la app no se auto-bloquea hasta que apagues el acceso web o bloquees PKEY.
- Web: un reloj de inactividad.
- Nunca pide autenticación extra. Los ajustes no se pisan.
