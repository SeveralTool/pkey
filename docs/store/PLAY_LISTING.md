# Ficha de Google Play (PKEY)

Textos y gráficos para la store listing. Subirlos a Console a mano (no hay Fastlane). No uses el `name` Expo en minúsculas: el título visible es **PKEY**.

Capturas: nunca una bóveda real. La app bloquea screenshots por defecto (`allowScreenshots: false`); hace falta un **build temporal** de listing.

## Título y textos

Límites de Play: título 30, corta 80, larga 4000.

### Español

| Campo | Texto |
|--------|--------|
| Título | `PKEY` |
| Corta | `Gestor de contraseñas local. Bóveda cifrada en tu dispositivo.` |
| Categoría | Herramientas (**Tools**). No Finanzas |
| Etiquetas (hasta 5) | `password manager`, `2FA`, `offline`, `autofill`, `local vault` |

**Descripción larga (ES)**

PKEY es un gestor de contraseñas local-first. La bóveda cifrada vive en tu teléfono. No hay una nube del editor que reciba tu contraseña maestra ni el contenido descifrado.

En el dispositivo podés guardar logins, notas y frases, generar contraseñas y códigos de un solo uso, y (en Android) ofrecer autocompletado al sistema si elegís PKEY en el selector del sistema operativo.

Opcional, en tu red local: abrir la bóveda en el navegador de una computadora de la misma Wi‑Fi. Ese tráfico va por tu red; no lo uses en redes públicas.

Internet se usa si abrís un enlace, importás un archivo, o activás opciones que vienen apagadas: iconos de sitios (se envía el dominio) y comprobación de filtraciones (se envía solo un prefijo de un hash, no la contraseña).

No es un banco, no procesa pagos y no es una VPN. Si perdés la contraseña maestra, no hay recuperación.

### English

| Field | Text |
|--------|------|
| Title | `PKEY` |
| Short | `Local password manager. Encrypted vault on your device.` |
| Category | **Tools** (not Finance) |
| Tags (up to 5) | `password manager`, `2FA`, `offline`, `autofill`, `local vault` |

**Full description (EN)**

PKEY is a local-first password manager. The encrypted vault stays on your phone. There is no publisher cloud that receives your master password or decrypted vault contents.

On the device you can store logins, notes, and seed phrases, generate passwords and one-time codes, and (on Android) offer autofill to the system if you pick PKEY in the OS autofill picker. iOS autofill is not included yet.

Optional, on your local network: open the vault in a browser on a computer on the same Wi‑Fi. That traffic stays on your network; do not use public networks.

Internet is used if you open a link, import a file, or turn on options that default to off: site icons (the domain is sent) and a breach check (only a short hash prefix is sent, not the password).

This is not a bank, it does not process payments, and it is not a VPN. If the master password is lost, it cannot be recovered.

### Lo que no hay que escribir

- “100% local”, “nunca sale a internet”, “militar”, “imposible de hackear”, AES-GCM, “más seguro que el banco”
- Autofill en iOS
- Optimizado para tablets (salvo que se haya verificado en hardware)

## Gráficos (archivos en el repo)

| Recurso | Medida | Ruta |
|---------|--------|------|
| High-res icon | 512×512 | `assets/logo/v6/all formats/android/play_store_512.png` |
| Feature graphic | 1024×500 | `assets/logo/v6/all formats/play-store/play_store_feature_graphic.png` |
| Launcher / adaptive | 1024×1024 | `assets/images/icon.png`, `assets/images/adaptive-icon.png` |
| Monochrome (Android 13+) | 1024×1024 | `assets/images/adaptive-icon-monochrome.png` (generado; `app.json` → `monochromeImage`) |

## Capturas de teléfono

Mínimo **2**, ideal **4–8**. 1080×1920 o 1080×2340, portrait. Sin notch recortado de forma que tape UI crítica.

1. Crear sesión (aviso de contraseña maestra + casilla legal; datos ficticios).
2. Lista de llaves (títulos inventados: “Correo”, “Wi‑Fi casa”).
3. Generador de contraseñas.
4. Acceso web / LAN (SSID opcional; red de prueba).
5. Ajustes → Legal o integridad de build.
6. Seguridad → autocompletado Android (si el dispositivo lo muestra).

**Cómo tomarlas**

1. Build de preview/dev con `allowScreenshots: true` **solo** para listing (no es el AAB de producción).
2. Cuenta / bóveda de demostración, nunca producción.
3. Restaurar `allowScreenshots: false` antes del AAB de tienda.

Tablets 7"/10": no subir salvo que el layout portrait se haya visto bien en un tablet real.

Vídeo: opcional. Mismas reglas de copy que la descripción.

## Contacto de ficha

| Campo | Estado |
|--------|--------|
| URL de privacidad | https://severaltool.github.io/pkey/privacy.html |
| URL de términos | https://severaltool.github.io/pkey/terms.html |
| Email de soporte | Obligatorio en Console. No hay `supportEmail` en el código: poné el de la cuenta de desarrollador |
| Sitio web | Opcional |

Declaraciones (Data safety, IARC, 18+, permisos): [../legal/PLAY_CONSOLE.md](../legal/PLAY_CONSOLE.md).
