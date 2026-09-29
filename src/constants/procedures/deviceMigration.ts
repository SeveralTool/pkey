import type { ProcedureDoc } from './types';

export const deviceMigrationProcedure: ProcedureDoc = {
  id: 'device_migration',
  title: {
    ESP: 'Migración de dispositivo',
    ING: 'Device migration',
  },
  body: {
    ESP: `PARA QUÉ SIRVE

La migración copia tu bóveda cifrada de un teléfono a otro por la red local (Wi‑Fi o red similar). No sube tus datos a una nube de PKEY: el traslado es entre tus dispositivos, en tu red.

ANTES DE EMPEZAR

• Ambos teléfonos deben tener PKEY instalado (versión con funciones nativas de migración).
• Estar en la misma red Wi‑Fi o red local de confianza.
• Tener a mano tu contraseña maestra: el teléfono nuevo la pedirá para abrir la bóveda recibida.
• Si activaste el secreto de dispositivo, tené también el kit de recuperación. Sin él el teléfono nuevo no podrá abrir la bóveda.
• En el teléfono viejo, la bóveda debe estar desbloqueada para poder enviar.

CÓMO ENVIAR DESDE EL TELÉFONO ACTUAL

1. Abre Seguridad → Migración de dispositivo.
2. Elige Enviar bóveda (o el botón equivalente).
3. Sigue las indicaciones en pantalla: el teléfono mostrará un código o QR para emparejar.
4. Mantén ambas apps abiertas y la pantalla activa hasta que termine.

CÓMO RECIBIR EN EL TELÉFONO NUEVO

1. En el teléfono nuevo, abre Migración → Recibir (también puedes empezar desde la pantalla de inicio de sesión si aún no tienes bóveda).
2. Escanea el código o introduce el emparejamiento que muestra el teléfono que envía.
3. Cuando termine la transferencia, desbloquea con tu contraseña maestra. Si el secreto de dispositivo estaba activo, el teléfono nuevo también necesita el kit de recuperación.

CONSEJOS

• Si falla, comprueba que ambos están en la misma red y que el firewall o el aislamiento de clientes del router no bloquee dispositivos.
• Después de migrar con éxito, puedes seguir usando el teléfono viejo o borrar la bóveda allí si ya no lo necesitas (eso es una decisión aparte, en Zona de peligro).
• La migración no sustituye un archivo de respaldo: si quieres una copia en archivo, usa también Exportar / backup.`,
    ING: `WHAT IT IS FOR

Migration copies your encrypted vault from one phone to another over the local network (Wi‑Fi or similar). It does not upload your data to a PKEY cloud — the transfer is between your devices on your network.

BEFORE YOU START

• Both phones need PKEY installed (a build that includes native migration).
• They should be on the same trusted Wi‑Fi or local network.
• Have your master password ready: the new phone will need it to unlock the received vault.
• If you turned on the device secret, have the recovery kit as well. Without it the new phone cannot open the vault.
• On the old phone, the vault must be unlocked before you can send.

HOW TO SEND FROM YOUR CURRENT PHONE

1. Open Security → Device migration.
2. Choose Send vault (or the matching button).
3. Follow the on-screen steps: the phone will show a code or QR to pair.
4. Keep both apps open and the screens awake until it finishes.

HOW TO RECEIVE ON THE NEW PHONE

1. On the new phone, open Migration → Receive (you can also start from the login screen if you do not have a vault yet).
2. Scan the code or enter the pairing shown on the sending phone.
3. When the transfer completes, unlock with your master password. If the device secret was on, the new phone also needs the recovery kit.

TIPS

• If it fails, check that both devices are on the same network and that router “client isolation” is not blocking phones from seeing each other.
• After a successful migration, you can keep using the old phone or clear the vault there later (that is a separate choice under Danger zone).
• Migration is not a file backup: if you want an export file, use Export / backup as well.`,
  },
};
