import type { ProcedureDoc } from './types';

export const webAccessProcedure: ProcedureDoc = {
  id: 'web_access',
  title: {
    ESP: 'Acceso web',
    ING: 'Web access',
  },
  body: {
    ESP: `QUÉ HACE ESTA SECCIÓN

El acceso web permite usar la bóveda en el navegador de una computadora (o tablet) que esté en el mismo Wi‑Fi de la casa que este teléfono. El tráfico de la bóveda en este modo va por tu red local; no uses redes públicas. La bóveda sigue en este dispositivo.

CÓMO USARLO

1. Activá «Usar en la computadora».
2. En la computadora, abrí el navegador.
3. En este teléfono, pulsá el botón verde Copiar dirección.
4. En la computadora, pegá en la barra de direcciones y pulsá Enter.
5. También podés pulsar Enviar a la computadora para compartir la dirección (por ejemplo por mensajería o correo).
6. Dejá PKEY abierto en este teléfono mientras trabajás. En Android puede seguir en segundo plano; en iPhone, dejá PKEY en pantalla.

SI NO SE ABRIÓ

• El teléfono y la computadora deben estar en el mismo Wi‑Fi de la casa.
• Pulsá «¿No se abrió en la computadora?» y copiá la otra dirección en letras grandes.
• Si en la computadora aparece un aviso para permitir PKEY, pulsá Permitir.

OTRO TELÉFONO O TABLET

Pulsá «Estoy usando otro teléfono o tablet» para mostrar un código que se puede escanear con la cámara de ese dispositivo. Es opcional. En una computadora de escritorio no hace falta cámara.

PARA SEGUIR CONECTADO

• Dejá la pestaña del navegador abierta mientras trabajás.
• Si volvés otro día, abrí PKEY en este teléfono y pulsá Copiar dirección otra vez. Después pegá en la computadora.
• En algunos equipos podés guardar la página como favorita cuando la dirección no usa números.
• Si cambia el Wi‑Fi, PKEY te pide que copies la dirección otra vez. El aviso de la pantalla de bloqueo no incluye la dirección.

ESTADO DE RED

• La sección muestra si este teléfono está en Wi‑Fi, datos móviles o sin red.
• El nombre del Wi‑Fi es opcional: el sistema pide permiso de ubicación solo para leerlo. No se usa GPS ni se envía nada fuera del teléfono.
• Podés activarlo sin Wi‑Fi, pero la computadora no va a alcanzar el teléfono por datos móviles.

SEGURIDAD

• Solo quien conoce tu contraseña maestra (o a quien apruebes en este teléfono) puede abrir la bóveda.
• Usalo solo en el Wi‑Fi de tu casa o en una red de confianza. Evitá el Wi‑Fi de un café o un aeropuerto.
• Abajo vas a ver los navegadores conectados. Si ves uno que no reconocés, podés bloquearlo.

SESIONES DISTINTAS (TELÉFONO VS NAVEGADOR)

• El teléfono y el navegador muestran un código para que confirmes que son la misma bóveda.
• Si reinstalaras la app, el navegador puede seguir teniendo llaves viejas. PKEY no las mezcla: aparece un aviso en el teléfono para elegir cuál conservar.
• Si elegís decidir más tarde, el navegador sigue offline. Las llaves nuevas que agregues ahí no se copian al teléfono hasta que elijas una copia.

REACTIVACIÓN AUTOMÁTICA

Si activás «Reactivar acceso web automáticamente al iniciar sesión», PKEY vuelve a activarlo cada vez que inicies sesión en este dispositivo.

En Android, bloquear el teléfono no apaga el acceso web. Se apaga si bloqueás PKEY («Cerrar sesión») o por inactividad con la app abierta. Eso no borra tu elección: al desbloquear se reactiva solo o PKEY pregunta, según ese interruptor.

CONFIRMAR EN ESTE TELÉFONO

Si activás «Confirmar acciones del navegador en este teléfono», editar, borrar, revelar y copiar en el navegador piden aprobación en este teléfono mientras el navegador está en línea.

DESBLOQUEAR CON ESTE TELÉFONO

Si activás «Desbloquear con este teléfono», la computadora puede mostrar un código de 6 números. Comparalo aquí y aprobá. Siempre podés escribir la contraseña maestra en el navegador.

EN RESUMEN

• Mismo Wi‑Fi de la casa, y PKEY abierto en el teléfono.
• Copiá la dirección y pegala en la computadora.
• Dejá la pestaña de la computadora abierta mientras trabajás.`,
    ING: `WHAT THIS SECTION DOES

Web access lets you use your vault in a browser on a computer (or tablet) that is on the same home Wi‑Fi as this phone. Vault traffic in this mode stays on your local network; do not use public networks. The vault stays on this device.

HOW TO USE IT

1. Turn on “Use on the computer”.
2. On the computer, open the internet browser.
3. On this phone, tap the green Copy address button.
4. On the computer, paste into the address bar and press Enter.
5. You can also tap Send to the computer to share the address (for example through messaging or email).
6. Keep PKEY open on this phone while you work. On Android it can keep running when minimized; on iPhone, leave PKEY on the screen.

IF IT DID NOT OPEN

• The phone and the computer must be on the same home Wi‑Fi.
• Tap “Did it not open on the computer?” and copy the other address shown in large letters.
• If a window on the computer asks to allow PKEY, tap Allow.

ANOTHER PHONE OR TABLET

Tap “I am using another phone or tablet” to show a code you can scan with that device’s camera. This is optional. You do not need a camera on a desktop computer.

STAYING CONNECTED

• Leave the browser tab open while you work.
• If you come back another day, open PKEY on this phone and tap Copy address again. Then paste on the computer.
• On some computers you can save the page as a favorite when the address does not use numbers.
• If the Wi‑Fi changes, PKEY asks you to copy the address again. The lock-screen alert does not include the address.

NETWORK STATUS

• The section shows whether this phone is on Wi‑Fi, mobile data, or no network.
• The Wi‑Fi name is optional: the system asks for location permission only to read it. GPS is not used and nothing is sent off the phone.
• You can turn this on without Wi‑Fi, but the computer will not reach the phone over mobile data.

SECURITY

• Only people who know your master password (or whom you approve on this phone) can open the vault.
• Use this only on the Wi‑Fi of your home or a network you trust. Avoid café or airport Wi‑Fi.
• Below you will see connected browsers. If you notice one you do not recognize, you can block it.

DIFFERENT SESSIONS (PHONE VS BROWSER)

• The phone and the browser show a code so you can confirm they are the same vault.
• If you reinstall the app, the browser may still hold older keys. PKEY does not merge them: a prompt on the phone asks which copy to keep.
• If you decide later, the browser stays offline. New keys you add there are not copied to the phone until you pick one copy.

AUTO RE-ENABLE

If you turn on “Re-enable web access automatically on login”, PKEY will start web access again every time you log in on this device.

On Android, locking the phone does not turn web access off. It turns off if you lock PKEY or after idle time with the app open. That does not forget your choice: after unlock it starts again automatically, or PKEY asks, according to that switch.

CONFIRM ON THIS PHONE

If you turn on “Confirm browser actions on this phone”, edit, delete, reveal, and copy in the browser ask this phone to approve while the browser is online.

UNLOCK WITH THIS PHONE

If you turn on “Unlock with this phone”, the computer can show a 6-digit code. Compare it here and approve. You can always type the master password in the browser.

IN SHORT

• Same home Wi‑Fi, and PKEY open on the phone.
• Copy the address, paste on the computer.
• Leave the computer tab open while you work.`,
  },
};
