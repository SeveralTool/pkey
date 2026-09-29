import type { ProcedureDoc } from './types';

export const deviceSecretProcedure: ProcedureDoc = {
  id: 'device_secret',
  title: {
    ESP: 'Secreto de dispositivo',
    ING: 'Device secret',
  },
  body: {
    ESP: `QUÉ ES

El secreto de dispositivo es opcional y está apagado por defecto. Si lo activás, la bóveda y cada backup .pkey de esta sección quedan atados a este teléfono. Un archivo copiado no abre en otro equipo solo con la contraseña maestra: hace falta también el kit de recuperación.

EL KIT DE RECUPERACIÓN

Al activar el interruptor, PKEY muestra un código para anotar o imprimir. Ese código es la única copia que podés llevar a otro teléfono. No va dentro del .pkey y no se vuelve a mostrar. PKEY no puede recuperarlo.

CÓMO ACTIVARLO

1. En Seguridad, en Respaldo y exportación, activá Secreto de dispositivo.
2. Identificate con biometría o contraseña maestra.
3. Anotá el código que aparece y guardalo aparte de los backups, en un lugar que solo vos controles.

CÓMO USARLO

• En este teléfono: la contraseña maestra o la biometría siguen alcanzando. El secreto queda en el hardware del aparato.
• En otro teléfono, al restaurar un .pkey o tras migrar: necesitás la contraseña maestra y el kit. Sin el kit el archivo no se abre; puede parecer que la contraseña está mal.
• CSV y JSON en claro tampoco usan el kit.

SI LO PERDÉS

Sin el kit no hay forma de abrir un .pkey atado en otro dispositivo. Si ya no lo necesitás, podés apagar el secreto en este teléfono (pide de nuevo la contraseña maestra) y volver a exportar un .pkey normal.`,
    ING: `WHAT IT IS

The device secret is optional and off by default. If you turn it on, the vault and every .pkey backup from this section are bound to this phone. A copied file will not open on another device with the master password alone: you also need the recovery kit.

THE RECOVERY KIT

When you enable the switch, PKEY shows a code to write down or print. That code is the only copy you can take to another phone. It is not stored inside the .pkey and it is not shown again. PKEY cannot recover it.

HOW TO TURN IT ON

1. Under Security → Backup and export, turn on Device secret.
2. Authenticate with biometrics or your master password.
3. Write down the code that appears and keep it apart from your backups, in a place only you control.

HOW TO USE IT

• On this phone: the master password or biometrics still unlock. The secret stays in this device’s hardware.
• On another phone, when restoring a .pkey or after migration: you need the master password and the kit. Without the kit the file will not open; it can look like the password is wrong.
• Unencrypted CSV and JSON do not use the kit either.

IF YOU LOSE IT

Without the kit there is no way to open a bound .pkey on another device. If you no longer need this protection, turn the secret off on this phone (it asks for the master password again) and export a normal .pkey.`,
  },
};
