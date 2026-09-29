import type { ProcedureDoc } from './types';

export const masterPasswordProcedure: ProcedureDoc = {
  id: 'master_password',
  title: {
    ESP: 'Por qué 12 caracteres',
    ING: 'Why 12 characters',
  },
  body: {
    ESP: `QUÉ PROTEGE ESTA CONTRASEÑA

Esta no es la clave de un sitio más: abre toda la bóveda. PKEY cifra tus llaves en este dispositivo. El editor no guarda la contraseña maestra y no puede recuperarla. Si alguien copia el archivo cifrado, puede intentar adivinarla fuera de la app, sin límite de tiempo.

QUÉ EXIGE LA APP AL CREAR UNA SESIÓN

• Al menos 12 caracteres.
• Que no sea predecible: no vale repetir la misma letra, ni una frase famosa, ni una palabra común con un número al final.

Los 12 caracteres solos no alcanzan si la frase es fácil de adivinar. La barra debajo del campo te indica si la app la aceptaría.

POR QUÉ EL MÍNIMO ES 12

Ocho o diez caracteres se sienten cómodos, pero dejan un espacio demasiado chico para un ataque fuera de línea contra el archivo cifrado. Doce es el piso que mantiene ese costo alto sin pedir 14 o 16, que mucha gente abandonaría.

CÓMO RECORDARLA SIN 12 SÍMBOLOS RAROS

No hace falta una cadena imposible de memorizar. Una frase de varias palabras sueltas, sin relación entre sí, suele ser más fácil de recordar y más difícil de adivinar que 12 símbolos. No uses una oración conocida ni una cita.

Después del primer desbloqueo podés activar la biometría. En el día a día no tenés que escribirla cada vez. Sí tenés que poder reconstruirla si cambiás de teléfono, reinstalás la app o restaurás un respaldo.

SI LA OLVIDÁS

No hay “olvidé mi contraseña” ni recuperación por correo. Si no la recordás, las llaves de este dispositivo no se pueden descifrar. Elegí una frase que de verdad puedas reconstruir, y un respaldo en un lugar que solo vos controles.

Si más adelante activás el secreto de dispositivo, un .pkey copiado también necesita el kit de recuperación. Perder la contraseña o el kit es irrecuperable.`,
    ING: `WHAT THIS PASSWORD PROTECTS

This is not one more site password: it opens the whole vault. PKEY encrypts your keys on this device. The publisher does not store the master password and cannot recover it. If someone copies the encrypted file, they can try to guess it outside the app, with no time limit.

WHAT THE APP REQUIRES WHEN YOU CREATE A SESSION

• At least 12 characters.
• It must not be predictable: repeating the same letter, a famous phrase, or a common word with a number at the end will not pass.

Twelve characters alone are not enough if the phrase is easy to guess. The bar under the field shows whether the app would accept it.

WHY THE MINIMUM IS 12

Eight or ten characters feel comfortable, but they leave too small a search space for an offline attack on the encrypted file. Twelve is the floor that keeps that cost high without asking for 14 or 16, which many people would give up on.

HOW TO REMEMBER IT WITHOUT 12 ODD SYMBOLS

You do not need an impossible string. A phrase of several unrelated words is usually easier to remember and harder to guess than 12 symbols. Do not use a well-known sentence or a quote.

After the first unlock you can turn on biometrics. Day to day you will not type it every time. You still need to be able to reconstruct it if you change phones, reinstall the app, or restore a backup.

IF YOU FORGET IT

There is no “forgot my password” and no email recovery. If you cannot remember it, the keys on this device cannot be decrypted. Choose a phrase you can truly reconstruct, and a backup in a place only you control.

If you later turn on the device secret, a copied .pkey also needs the recovery kit. Losing the password or the kit cannot be undone.`,
  },
};
