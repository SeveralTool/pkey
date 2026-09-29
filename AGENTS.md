# 🧠 AGENTS.md – PKey Project (React Native + Expo + TypeScript)

## 1. Propósito y Filosofía del Proyecto
Somos **PKey**, una aplicación móvil construida con **React Native + Expo (managed workflow + dev client)**. Nuestro ADN es **local‑first, offline‑capable, y totalmente autónomo**. El bundler y el tráfico de desarrollo se limitan a la **red WiFi local**; nunca exponemos la app a Internet con túneles.

> **Principios rectores**: Seguridad, rendimiento, tipado fuerte, mantenibilidad, y experiencia de usuario fluida.

---

## 2. Entorno de Desarrollo y Red (IMPORTANTE)
- **Servidor**: `npm start` → `expo start --dev-client` (LAN). Equivalente: `npx expo start --dev-client --lan`.
- **Conexión desde el PC**: Metro en `http://<IP_DEL_PC_O_TELÉFONO>:8081`. **No uses túneles** (`--tunnel`) ni ngrok.
- **IP**: Dinámica por defecto. Para estabilidad, **IP estática en el teléfono** o **reserva DHCP**. No se permite modificar la red desde el código de la app.
- **Variables de entorno**: `.env` local (ignorado por Git). Nunca incluyas secretos en el código.
- **Tests**: Jest + Testing Library en la app móvil (`src/`). Vitest en `@pkey/core` y `@pkey/web-client`. Playwright para e2e de la PWA.

---

## 3. Estándares de Código (TypeScript + React Native)

### 3.1. Tipado y Seguridad de Tipos
- **Todo el código nuevo debe ser TypeScript** (`*.ts` / `*.tsx`).
- **`strict: true`** en `tsconfig.json`. Objetivo: `noUnusedLocals` (aún no está activado en el root; el código nuevo no debe dejar locals sin usar).
- **Define tipos explícitos** para props, estado, hooks y funciones. Evita `any`; si es necesario, usa `unknown` con guards.
- **Crea interfaces/alias** para objetos complejos y respuestas de API.
- **Prefiere `Readonly<T>`** en props y parámetros públicos que no deben mutarse.
- **Datos externos** (JSON de bóveda al decrypt, sync LAN, archivos de import): validar con **zod** o guards equivalentes. Prohibido `JSON.parse(...) as T` en código nuevo.

### 3.2. Estructura de Archivos y Organización
`App.tsx` elige Login vs Dashboard según `isLogged`. Las tabs del dashboard usan **React Navigation Native Bottom Tabs** anidadas solo en `DashboardScreen` (screens nativos; la barra del sistema se oculta). El chrome es una **píldora flotante** (`DashboardFloatingTabBar`): Liquid Glass en iOS 26+, blur en iOS anterior, superficie translúcida en Android. Login, overlays globales y providers quedan fuera del navigator. No uses Expo Router. `UIContext.currentTab` sigue siendo la API de la app; el navigator se sincroniza con `navigateDashboardTab`.

```
src/
├── bootstrap/      # Polyfills nativos (CSPRNG / PBKDF2)
├── components/     # UI reutilizable (cards, common, import, migration, notifications, …)
├── screens/        # Login + tabs del dashboard
├── navigation/     # Native tab screens + floating glass pill (sin Expo Router)
├── context/        # Providers (auth, db, sync, migration, settings, UI, notifications)
├── hooks/          # Lógica extraída (análisis, auto-lock, stats, …)
├── services/       # Cifrado, storage, biometría, sync/web/migración
├── notifications/  # Cola in-app + helpers OS (sin provider ni JSX de host)
├── utils/          # Helpers (merge, auto-logout policy, links, …)
├── types/          # Reexports de @pkey/core + tipos móviles
├── constants/      # Config, i18n, iconos, procedimientos de ayuda
├── styles/         # Tokens de tema / estilos globales
└── web/            # PWA embebida (HTML/assets generados)
```

Dominio compartido: `packages/core`. PWA LAN: `packages/web-client` (Solid.js). Módulos nativos: `modules/pkey-autofill`, `modules/pkey-web-access`.

### 3.3. Componentes Funcionales y Hooks
- **Siempre** componentes funcionales con props tipadas (`React.FC` opcional). `ErrorBoundary` de clase es la excepción justificada.
- **Extrae lógica compleja** a hooks (ej. `useBackgroundAutoLogout`, `useCardAnalysis`).
- **Evita** renders innecesarios con `React.memo` / `useMemo` / `useCallback` **con criterio**.
- **Mantén** componentes pequeños (SRP). Partir archivos de 500+ líneas en PRs incrementales, no en un mega-refactor.

### 3.4. Estilo y Formato
- **Prettier**: printWidth 100, singleQuote true.
- **ESLint**: `eslint-config-expo` (incluye react-hooks). SDK 56 desactiva reglas extra (`refs`, `purity`, `set-state-in-effect`); **no** desactivar `react-hooks/exhaustive-deps` en código nuevo.
- **Nombrado**: Componentes `PascalCase`; funciones `camelCase`; constantes `UPPER_SNAKE_CASE`; archivos kebab-case o PascalCase de componente.
- **Imports**: librerías externas → internas (`@pkey/core`) → relativas → estilos/assets.

---

## 4. Rendimiento (Optimización Móvil)

- **Listas largas**: `FlashList` (preferido) o `FlatList` con `getItemLayout` / `initialNumToRender` / `windowSize`.
- **Lazy**: `React.lazy` + `Suspense` para Dashboard y flujos pesados (migración).
- **Imágenes**: `expo-image` o `Image` con tamaños adecuados.
- **Hilo principal**: `InteractionManager` para trabajo diferible.
- **Memoria**: cleanup de suscripciones y timers en `useEffect`.
- **Assets**: optimizar antes de compilar.

---

## 5. Seguridad (Local y en Red)

- **Nunca** almacenes credenciales o secretos de pairing/sesión en texto plano ni en AsyncStorage. Usa **`expo-secure-store`** (`WHEN_UNLOCKED_THIS_DEVICE_ONLY` cuando deba ser device-bound).
- El **master password no se persiste**. En sesión solo vive la root key derivada en memoria (`sessionKey`).
- **Comunicaciones**: LAN local. HTTPS/TLS donde ya existe (migración). HTTP + cifrado de canal en web sync; no exponer a Internet.
- **Validación de entrada**: sanitizar formularios y payloads externos.
- **Permisos**: pedirlos en el momento de uso (cámara, red local).
- **Red**: en producción el servidor web LAN está apagado salvo que el usuario lo active.

---

## 6. Robustez y Manejo de Errores

- **ErrorBoundary** a nivel de app (`AppErrorBoundary`). La PWA debe tener el equivalente Solid.
- **try/catch** en promesas y `async/await` de efectos.
- **Logging**: `console.warn` / `error` en desarrollo.
- **Tests**: cubrir lógica crítica (cifrado, storage, sesión, biometría, auto-lock, merge/sync).
- **Retry** con límite en red; estados de carga/error visibles.

---

## 7. Experiencia de Usuario (UX/UI)

- Feedback inmediato (spinners, overlays) en operaciones async.
- Animaciones: `react-native-reanimated` y `react-native-gesture-handler`.
- Accesibilidad: `accessibilityLabel`, `accessibilityRole`, estado `selected` en tabs.
- Modo oscuro: tema del sistema (`useColorScheme` / setting `AUTO`), no `react-native-appearance`.

---

## 8. Documentación y Comentarios

- **TSDoc en inglés** en funciones públicas, hooks y componentes.
- **README** por módulo crítico (propósito + API). Los stubs que solo apuntan a `docs/` deben ir enriqueciéndose.
- **Diagramas**: usar **Mermaid** (```mermaid) para flujos, estados y secuencias en `.md`; no ASCII art nuevo en flujos que representen procesos. Validar con `npm run docs:validate` (renderiza cada bloque; falla si hay sintaxis inválida o mermaid en procedures in-app). **Prohibido** mermaid en `docs/templates/procedures/` y `src/constants/procedures/` (se renderizan como texto plano dentro de la app móvil). Al tocar un diagrama, verificar las transiciones contra el código real (`@pkey/core` sync, `packages/web-client` appStore, etc.).
- Referencia técnica: [`docs/MOBILE_APP.md`](docs/MOBILE_APP.md), [`docs/CORE_PACKAGE.md`](docs/CORE_PACKAGE.md), [`docs/WEB_CLIENT.md`](docs/WEB_CLIENT.md).
- **Commits**: Conventional Commits (`feat:`, `fix:`, `refactor:`, …).

---

## 9. Directrices para el Agente de IA

- Prioriza **seguridad y rendimiento** sobre velocidad de desarrollo.
- Soluciones de red **locales** (IP fija, DHCP) — nunca túneles externos.
- Código con tipado fuerte, fácil de leer. Extrae a hooks en lugar de inflar contexts.
- Refactors grandes: por fases y por módulo (ver plan de calidad en el historial del repo).
- Si no estás seguro, pregunta antes de asumir.
- **Nunca construyas el APK.** No ejecutes `npm run build:apk`, `scripts/build-apk.mjs`, `gradlew assembleDebug` ni `expo prebuild` para generar un APK. Eso lo hace el usuario en su máquina; lanzarlo desde el agente gasta tokens en un Gradle largo e inútil. Podés editar el script o explicar el comando; no lo corras.

---

## 10. Nota Final
Este documento es el contrato de calidad. Debe describir el repo **real**. Si hay ambigüedad, proponé un cambio concreto a este archivo junto con el código.
