# Secreto de dispositivo

## QUÉ ES

El secreto de dispositivo es opcional y está apagado por defecto. Si lo activás, la bóveda y cada backup `.pkey` de esta sección quedan atados a este teléfono. Un archivo copiado no abre en otro equipo solo con la contraseña maestra: hace falta también el kit de recuperación.

## EL KIT DE RECUPERACIÓN

Al activar el interruptor, PKEY muestra un código para anotar o imprimir. Ese código es la única copia que podés llevar a otro teléfono. No va dentro del `.pkey` y no se vuelve a mostrar. PKEY no puede recuperarlo.

## CÓMO ACTIVARLO

1. En Seguridad, en Respaldo y exportación, activá Secreto de dispositivo.
2. Identificate con biometría o contraseña maestra.
3. Anotá el código que aparece y guardalo aparte de los backups, en un lugar que solo vos controles.

## CÓMO USARLO

- En este teléfono: la contraseña maestra o la biometría siguen alcanzando. El secreto queda en el hardware del aparato.
- En otro teléfono, al restaurar un `.pkey` o tras migrar: necesitás la contraseña maestra y el kit. Sin el kit el archivo no se abre; puede parecer que la contraseña está mal.
- CSV y JSON en claro tampoco usan el kit.

## SI LO PERDÉS

Sin el kit no hay forma de abrir un `.pkey` atado en otro dispositivo. Si ya no lo necesitás, podés apagar el secreto en este teléfono (pide de nuevo la contraseña maestra) y volver a exportar un `.pkey` normal.
