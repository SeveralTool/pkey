import type { ProcedureDoc } from './types';

export const sessionLockProcedure: ProcedureDoc = {
  id: 'session_lock',
  title: {
    ESP: 'Cierre de sesión',
    ING: 'Session lock',
  },
  body: {
    ESP: `QUÉ CONTROLA ESTA SECCIÓN

Acá se elige cuándo se vuelve a pedir la contraseña maestra: en el teléfono y, por separado, en el navegador (acceso web). Un control no cambia el otro. «Nunca» en cualquiera de los dos pide biometría o la contraseña maestra.

AUTOBLOQUEO DE LA APP (AL SALIR)

• Inmediatamente: al salir de la app (inicio u otra app) la bóveda se bloquea. Si el sistema no llega a pasar a segundo plano (cambio muy rápido), se bloquea al volver. No se bloquea por hojas del sistema (compartir, Face ID, permisos).
• 1 minuto: si dejás la app un minuto o más, al volver pide desbloqueo. El tiempo es de reloj real.
• Nunca: el teléfono no bloquea solo al salir. Seguís necesitando contraseña o biometría al abrir la app si la sesión no está activa.

BLOQUEO POR INACTIVIDAD

Si no tocás la app mientras está abierta, se bloquea según 1 / 5 / 15 minutos o Nunca. Es independiente del bloqueo al salir. «Nunca» también pide autenticación extra.

ACCESO WEB AL BLOQUEAR

En Android, si el acceso web está activo, bloquear el teléfono o dejar PKEY en segundo plano no apaga el servidor ni bloquea la bóveda: sigue con la notificación de segundo plano para usarlo en la computadora. «Inmediatamente» y «1 minuto» no corren hasta que apagues el acceso web o bloquees PKEY a propósito («Cerrar sesión») o por inactividad con la app abierta. En iPhone el sistema no puede mantenerlo al bloquear; al volver se puede reactivar.

AUTOBLOQUEO WEB

5 min, 15 min, 1 hora o Nunca. El reloj corre aunque cambies de pestaña. «Nunca» pide autenticación extra.

MODO ESTRICTAMENTE OFFLINE

La bóveda no sale a la red (ni LAN ni Internet): apaga y oculta el acceso web, la comprobación de filtraciones y los iconos remotos.

EN RESUMEN

• App: autobloqueo al salir (Inmediatamente / 1 minuto / Nunca) y bloqueo por inactividad (1 / 5 / 15 min / Nunca).
• Acceso web LAN: en Android sigue si bloqueás el teléfono, y la app no se auto-bloquea hasta que apagues el acceso web o bloquees PKEY.
• Web: un reloj de inactividad.
• Nunca pide autenticación extra. Los ajustes no se pisan.`,
    ING: `WHAT THIS SECTION CONTROLS

Here you choose when the master password is asked again: on the phone and, separately, in the browser (web access). One control does not change the other. “Never” on either one requires biometrics or the master password.

APP AUTO-LOCK (WHEN LEAVING)

• Instantly: leaving the app (home screen or another app) locks the vault. If the system never fully backgrounds the app (a very quick switch), it locks when you come back. System sheets (share, Face ID, permissions) do not lock it.
• 1 minute: if you leave for a minute or more, unlocking is required when you come back. That uses real elapsed time.
• Never: the phone does not lock by itself when you leave. You still need the password or biometrics to open the app if the session is not active.

LOCK WHEN UNUSED

If you do not touch the app while it stays open, it locks after 1 / 5 / 15 minutes, or Never. This is independent of the background lock. “Never” also requires extra authentication.

WEB ACCESS ON LOCK

On Android, if web access is on, locking the phone or leaving PKEY in the background does not turn the server off or lock the vault: the background notification stays so you can use the computer. Instantly and 1 minute do not run until you turn web access off or lock PKEY on purpose (Lock PKEY) or after unused time with the app open. iPhone cannot keep it running after lock; you can re-enable it when you come back.

WEB AUTO-LOCK

5 min, 15 min, 1 hour, or Never. The clock keeps running if you change tabs. “Never” requires extra authentication.

STRICTLY OFFLINE MODE

The vault stays off the network (LAN and Internet): turns off and hides web access, breach checks, and remote icons.

IN SHORT

• App: auto-lock when leaving (Instantly / 1 minute / Never) and lock when unused (1 / 5 / 15 min / Never).
• LAN web access: on Android it stays on if you lock the phone, and the app does not auto-lock until you turn web access off or lock PKEY.
• Web: one inactivity clock.
• Never asks for extra authentication. The settings do not override each other.`,
  },
};
