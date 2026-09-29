import type { ProcedureDoc } from './types';

export const vaultHealthProcedure: ProcedureDoc = {
  id: 'vault_health',
  title: {
    ESP: 'Salud de la bóveda',
    ING: 'Vault health',
  },
  body: {
    ESP: `QUÉ ES

La puntuación de salud resume, en un número de 0 a 100, cómo de segura está tu bóveda en este momento. Un valor alto significa menos riesgos evidentes; uno bajo indica que conviene revisar algunas llaves.

EN QUÉ SE BASA

La app mira varias señales en tus llaves de tipo contraseña (y, en algunos casos, en el conjunto de llaves):

• Contraseñas repetidas: la misma clave usada en más de un sitio.
• Contraseñas débiles: claves demasiado cortas o predecibles.
• Llaves antiguas: sin actualizar en más de 90 días.
• Sin verificación en dos pasos (2FA/OTP): logins de contraseña sin código temporal configurado.
• Contraseñas vacías: entradas de login sin clave guardada.

Cada problema baja un poco la puntuación. No hace falta entender fórmulas: si el número baja, casi siempre es porque alguna de esas situaciones aparece en tus llaves.

CÓMO MEJORARLA

1. En Estadísticas, toca las métricas con aviso (por ejemplo contraseñas débiles o repetidas) para ver esas llaves.
2. Cambia las claves débiles o reutilizadas por otras más fuertes y únicas.
3. Actualiza llaves viejas cuando cambies una contraseña en el sitio real.
4. Activa 2FA en los sitios importantes y guarda el secreto OTP en la llave.
5. Completa las contraseñas que dejaste en blanco.

La puntuación se recalcula sola al guardar cambios. El objetivo no es “100 por obligación”, sino reducir riesgos reales en tu día a día.`,
    ING: `WHAT IT IS

The health score summarizes, as a number from 0 to 100, how secure your vault looks right now. Higher means fewer obvious risks; lower means some keys deserve a closer look.

WHAT IT LOOKS AT

The app checks several signals on your password-type keys (and, for some checks, across all keys):

• Reused passwords: the same password on more than one site.
• Weak passwords: keys that are too short or easy to guess.
• Stale keys: not updated in more than 90 days.
• Missing two-factor (2FA/OTP): password logins without a one-time code set up.
• Empty passwords: login entries with no password saved.

Each issue lowers the score a bit. You do not need the math: if the number drops, one of those situations is showing up in your vault.

HOW TO IMPROVE IT

1. In Stats, tap metrics that show a warning (for example weak or reused passwords) to open those keys.
2. Replace weak or reused passwords with stronger, unique ones.
3. Update older keys when you change a password on the real site.
4. Turn on 2FA for important sites and save the OTP secret on the key.
5. Fill in any blank passwords you left empty.

The score updates automatically when you save changes. The goal is not a perfect 100 at all costs — it is fewer real risks in daily use.`,
  },
};
