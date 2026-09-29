import type { ProcedureDoc } from './types';

export const dangerZoneProcedure: ProcedureDoc = {
  id: 'danger_zone',
  title: {
    ESP: 'Zona de peligro',
    ING: 'Danger zone',
  },
  body: {
    ESP: `QUÉ HAY AQUÍ

La zona de peligro agrupa acciones irreversibles o muy destructivas sobre tu bóveda en este dispositivo. Están separadas del resto a propósito, para que no las pulses por error.

BORRAR TODAS LAS LLAVES

Esta acción elimina todas las llaves guardadas en la bóveda de este teléfono. No “oculta” las llaves: las quita de forma permanente de esta copia local.

Antes de confirmar:

1. La app te pedirá autenticación (biometría o contraseña maestra).
2. Verás un resumen de cuántas llaves se van a borrar.
3. Tendrás que confirmar de nuevo. No hay deshacer después.

Si más adelante necesitas los datos, solo podrás recuperarlos desde un backup .pkey o desde otro dispositivo donde aún existan.

REINICIAR SESIÓN / DATOS LOCALES (SI APARECE)

Algunas opciones de esta zona también pueden borrar la sesión local o dejar el teléfono como si no hubiera bóveda. Eso no recupera contraseñas: las pierde en este dispositivo. Úsalo solo si entiendes la consecuencia (por ejemplo, vas a restaurar un backup a continuación).

ANTES DE USAR LA ZONA DE PELIGRO

• Exporta un backup .pkey si aún quieres conservar algo. Si el secreto de dispositivo está activo, guardá también el kit de recuperación.
• Comprueba que la migración a otro teléfono ya terminó bien, si ese era tu plan.
• Asegúrate de no necesitar las llaves solo en este dispositivo.

EN RESUMEN

La zona de peligro es la última puerta: útil para limpiar un teléfono que ya no usas o empezar de cero, peligrosa si la usas sin una copia. Cuando dudes, exporta primero y luego borra.`,
    ING: `WHAT THIS SECTION IS

Danger zone groups irreversible or highly destructive actions on the vault on this device. They are kept apart on purpose so you do not tap them by accident.

DELETE ALL KEYS

This removes every key stored in the vault on this phone. Keys are not merely hidden — they are permanently removed from this local copy.

Before it completes:

1. The app will ask you to authenticate (biometrics or master password).
2. You will see how many keys will be deleted.
3. You must confirm again. There is no undo afterward.

If you need the data later, you can only get it back from a .pkey backup or from another device that still has the vault.

RESET SESSION / LOCAL DATA (IF SHOWN)

Some options here may also clear the local session or leave the phone as if no vault exists. That does not recover passwords — it removes them from this device. Use it only when you understand the result (for example, you are about to restore a backup next).

BEFORE YOU USE DANGER ZONE

• Export a .pkey backup if you still want to keep anything. If the device secret is on, keep the recovery kit as well.
• Confirm migration to another phone finished successfully, if that was your plan.
• Make sure you do not need these keys only on this device.

IN SHORT

Danger zone is the last door: useful to wipe a phone you no longer use or to start clean, risky if you use it without a copy. When in doubt, export first, then delete.`,
  },
};
