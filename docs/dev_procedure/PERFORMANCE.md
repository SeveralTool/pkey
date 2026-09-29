> **LEE ESTO PRIMERO, AGENTE.**
>
> Este archivo NO es una guía de referencia. Es un **protocolo de ejecución obligatorio**.
> Cuando este archivo esté presente en el repositorio, tu tarea es realizar una **auditoría de rendimiento ultra-profunda** de todo el proyecto React Native + Expo, siguiendo las skills oficiales de rendimiento.
>
> No esperes a que el usuario te pida auditar un archivo específico. **Tú decides el alcance completo** y lo recorres exhaustivamente. Tu trabajo es encontrar problemas reales, no sugerencias genéricas.
>
> Si no puedes leer un archivo (binario, generado, etc.), sáltalo y regístralo como "no auditable". Si no puedes medir algo (FPS reales, memoria nativa), indícalo como "requiere medición manual" y documenta cómo medirlo.

---

## 🎯 Objetivo del Protocolo

Realizar una **auditoría de rendimiento de nivel producción** sobre un proyecto React Native + Expo, cubriendo las **9 categorías críticas** de rendimiento, aplicando las reglas de las siguientes skills:

- `expo-react-native-performance` (54 reglas)
- `react-native-skills` (35+ reglas)
- `react-native-best-practices` (POWER.md)
- `optimising-expo-react-native-performance`
- `react-native-dev` → `references/performance.md`

**Cada hallazgo debe ser accionable, con evidencia, archivo + línea, y regla violada.**

---

## 🧭 Flujo de Trabajo Obligatorio (síguelo en orden)

### FASE 0 — Reconocimiento del Proyecto

Antes de buscar problemas, construye un mapa mental del proyecto:

1. **Lee `package.json`** → identifica:
   - Versión de `expo` y `react-native`
   - Motor JS (Hermes sí/no), `newArchEnabled`
   - Dependencias clave: `react-navigation`, `expo-router`, `reanimated`, `gesture-handler`, `flashlist`, `expo-image`, `@tanstack/react-query` / `swr`, `zustand` / `redux`, `moment`, `lodash`, etc.
   - Scripts de build y release
2. **Lee `app.json` / `app.config.js` / `app.config.ts`** → identifica:
   - Configuración de `plugins`, `splash`, `updates`, `assetBundlePatterns`
   - `android` / `ios` específico (ProGuard, split APKs, `jsEngine`, `enableProguardInReleaseBuilds`)
3. **Lee `babel.config.js` / `metro.config.js` / `tsconfig.json`** → identifica:
   - Plugins de Babel (Reanimated, React Compiler, `babel-plugin-transform-remove-console`)
   - Alias de Metro, transformaciones, resolver
4. **Lista el árbol completo de carpetas** (`app/`, `src/`, `components/`, `screens/`, `hooks/`, `services/`, `store/`, `assets/`, `native-modules/`)
5. **Identifica los puntos de entrada**: `App.tsx`, `index.js`, `app/_layout.tsx` (Expo Router), rutas principales.
6. **Identifica la navegación**: ¿native-stack? ¿tabs? ¿drawer? ¿Expo Router?
7. **Identifica las pantallas con más tráfico** (o las que el usuario indique como críticas).

**Salida de la Fase 0:** Un resumen de 1 página con el stack, arquitectura y superficie de la auditoría.

---

### FASE 1 — Auditoría Categoría por Categoría

Recorre **obligatoriamente las 9 categorías** en el orden de prioridad. Para cada una:

1. **Localiza los archivos relevantes** con `grep`/`rg` (búsqueda por patrones, imports, hooks, props).
2. **Lee los archivos completos**, no solo fragmentos. El rendimiento se rompe en los detalles.
3. **Aplica cada regla** de la categoría. Marca `PASS`, `FAIL` o `N/A`.
4. **Documenta cada FAIL** con: archivo, línea(s), fragmento de código, regla violada, impacto estimado (Crítico/Alto/Medio/Bajo), y fix propuesto.
5. **No inventes problemas.** Si una regla no aplica, márcala como `N/A` con justificación.

---

## ✅ Checklist Obligatorio por Categoría

> Para cada categoría, busca activamente los patrones listados. Usa `rg` con los patrones sugeridos.

### 🔴 1. Arranque de la App (`launch-`) — CRÍTICO

**Patrones a buscar:**
- `rg "import .* from ['\"]\.\./\.\./"` en `App.tsx`, `index.js`, `app/_layout.tsx`
- `rg "SplashScreen" --type ts`
- `rg "useFonts|Font.loadAsync|loadAsync"` en entry points
- `rg "newArchEnabled|jsEngine" app.json app.config.*`
- Inicializaciones en el módulo raíz: `analytics.init()`, `sentry.init()`, `i18n.init()`, `configureStore()`
- Imports pesados en el árbol del entry point (`moment`, `lodash`, `@shopify/react-native-skia`, etc.)

**Preguntas obligatorias:**
- ¿Cuántos imports tiene el entry point? ¿Se pueden diferir?
- ¿La splash screen se oculta antes de que la UI esté lista?
- ¿Se precargan fuentes/imágenes críticas?
- ¿Hay código síncrono pesado en el arranque (crypto, parsing, migraciones de DB)?

---

### 🔴 2. Tamaño del Bundle (`bundle-`) — CRÍTICO

**Patrones a buscar:**
- Barrel files: `rg "export \* from|export \{.*\} from" --glob "**/index.ts"`
- `rg "from ['\"]moment['\"]"` (alternativa: `date-fns`, `dayjs`)
- `rg "from ['\"]lodash['\"]"` (alternativa: `lodash-es`, import selectivo)
- `rg "from ['\"]@fortawesome|react-native-vector-icons"` (fuentes completas)
- `rg "require\(.*\.(png|jpg|jpeg|gif|svg)"` en JS
- `rg "console\.log|console\.warn"` en `src/` y `app/`
- ¿Hay `bundle-analyze-size` en scripts?
- ¿`enableProguardInReleaseBuilds: true` en `app.json`?
- ¿`android.buildArchs` o `split` configurado?

**Preguntas obligatorias:**
- ¿Cuál es el tamaño actual del bundle? (ejecutar `npx expo export --analyze` si es posible)
- ¿Hay dependencias duplicadas o no usadas? (verificar con `npx depcheck`)
- ¿Las fuentes personalizadas están subsetted?
- ¿Hay Polyfills innecesarios (`core-js`, `regenerator-runtime`)?

---

### 🟠 3. Virtualización de Listas (`list-`) — ALTO

**Patrones a buscar:**
- `rg "FlatList|SectionList|ScrollView"` → TODAS las ocurrencias
- `rg "\.map\(.*=>.*<" ` en pantallas con datos (renderizado en JSX directo en lugar de lista virtualizada)
- `rg "renderItem=\{" ` → detectar funciones inline
- `rg "keyExtractor=\{"` → detectar funciones inline
- ¿Se usa `FlashList` en alguna parte? `rg "FlashList"`
- `rg "estimatedItemSize"` (si usa FlashList)
- `rg "React\.memo" ` en componentes de ítem
- `rg "useCallback"` en `renderItem`

**Preguntas obligatorias:**
- ¿Hay `ScrollView` con más de 20 ítems? → FAIL crítico.
- ¿Hay `FlatList` con más de 100 ítems sin `getItemLayout`? → FAIL.
- ¿Los `renderItem` son funciones inline? → FAIL.
- ¿Los componentes de ítem están memoizados? → Si no, FAIL.
- ¿Hay listas anidadas dentro de `ScrollView`? → FAIL crítico.

---

### 🟠 4. Imágenes (`image-`) — ALTO

**Patrones a buscar:**
- `rg "from ['\"]react-native['\"].*Image"` → ¿usa `Image` nativo en lugar de `expo-image`?
- `rg "expo-image"` → ¿está instalado? ¿se usa?
- `rg "source=\{\{ uri:"` → todas las cargas remotas
- `rg "\.png|\.jpg|\.jpeg"` en `assets/` → tamaños de archivo
- `rg "width=\{|height=\{"` en `<Image>` / `<FastImage>` / `<ExpoImage>`
- `rg "BlurHash|ThumbHash|placeholder"`

**Preguntas obligatorias:**
- ¿Se usa `expo-image`? Si no, es un FAIL alto.
- ¿Las imágenes remotas se sirven en WebP?
- ¿Se está cargando una imagen más grande que su tamaño de display?
- ¿Hay placeholders (blurhash/thumbhash)?
- ¿Se precargan imágenes críticas de la primera pantalla?
- ¿Las imágenes locales están optimizadas (compresión, tamaño correcto)?

---

### 🟠 5. Obtención de Datos (`data-`) — ALTO

**Patrones a buscar:**
- `rg "fetch\(|axios\(|\.get\(|\.post\("` en `src/`, `app/`
- `rg "await .*await"` → detectar awaits secuenciales que deberían ser `Promise.all`
- `rg "useEffect\(\s*async"` → patrones peligrosos
- `rg "AbortController|signal:"` → ¿se cancelan las peticiones?
- `rg "react-query|@tanstack/react-query|swr"` → ¿hay caché?
- `rg "useState\(\[\]\)|useState\(null\)"` en componentes con fetch
- ¿Hay paginación? `rg "page|offset|limit|cursor"`

**Preguntas obligatorias:**
- ¿Hay fetches secuenciales que podrían ser paralelos?
- ¿Se cancelan las peticiones al desmontar?
- ¿Hay caché (React Query, SWR, manual)?
- ¿Hay deduplicación de peticiones concurrentes?
- ¿Se re-fetchea innecesariamente en cada render o focus?

---

### 🟡 6. Navegación (`nav-`) — MEDIO-ALTO

**Patrones a buscar:**
- `rg "createStackNavigator|createNativeStackNavigator"` → ¿usa native-stack?
- `rg "createBottomTabNavigator|createMaterialTopTabNavigator"` → ¿tabs nativos?
- `rg "React.lazy|import\("` → code splitting
- `rg "screenOptions"` → opciones pesadas por pantalla
- ¿Se usa Expo Router con `lazy`?

**Preguntas obligatorias:**
- ¿Se usan navegadores nativos o JS?
- ¿Hay pantallas cargadas de forma eager que deberían ser lazy?
- ¿Hay componentes pesados importados en el `Navigator` raíz?

---

### 🟡 7. Re-renderizados (`rerender-`) — MEDIO

**Patrones a buscar:**
- `rg "useContext\("` → Context API sin selectores
- `rg "useSelector|useStore"` → selectores selectivos
- `rg "React\.memo|useMemo|useCallback"` → medir cobertura
- `rg "style=\{\{"` → estilos inline recreados en cada render
- `rg "=\{\[\]\}|=\{\{\}\}"` → arrays/objetos literales como props
- `rg "onPress=\{\(\) =>"` → funciones inline en props
- `rg "key=\{index\}"` → keys inestables

**Preguntas obligatorias:**
- ¿Los componentes de lista están memoizados?
- ¿Las props que se pasan a hijos son estables?
- ¿Hay Context Providers que envuelven toda la app y cambian frecuentemente?
- ¿Se usa `useMemo`/`useCallback` correctamente (no en exceso ni de menos)?

---

### 🟡 8. Animaciones (`anim-`) — MEDIO

**Patrones a buscar:**
- `rg "Animated\.timing|Animated\.spring|Animated\.decay"`
- `rg "useNativeDriver"` → ¿está en `true`?
- `rg "useSharedValue|withTiming|withSpring|useAnimatedStyle"` (Reanimated)
- `rg "width|height|top|left|margin|padding"` en `useAnimatedStyle` → propiedades NO GPU
- `rg "LayoutAnimation"` → alternativa obsoleta
- `rg "Animated\.Value"` vs Reanimated

**Preguntas obligatorias:**
- ¿Todas las animaciones usan `useNativeDriver: true` (o Reanimated)?
- ¿Se animan propiedades no GPU (`width`, `height`, `top`, `left`)?
- ¿Se usan `Gesture.Tap` en lugar de `Pressable` para gestos complejos?
- ¿Hay animaciones que se ejecutan en el hilo de JS?

---

### 🔵 9. Memoria (`mem-`) — BAJO-MEDIO

**Patrones a buscar:**
- `rg "useEffect\("` → ¿todos tienen cleanup?
- `rg "addEventListener|subscribe\(|setInterval|setTimeout"` → ¿se limpian?
- `rg "new WebSocket|new EventSource"` → ¿se cierran?
- `rg "AbortController"` → ¿se abortan?
- `rg "ref\.current"` → ¿se nulan al desmontar?

**Preguntas obligatorias:**
- ¿Hay fugas en efectos sin cleanup?
- ¿Se cancelan las suscripciones?
- ¿Se limpian los timers?
- ¿Se cierran las conexiones?

---

## 🔬 FASE 2 — Búsqueda Ultra-Profunda (más allá del checklist)

Una vez completado el checklist por categoría, **profundiza** con estas técnicas:

1. **Trazado de imports críticos:** Partiendo de los entry points, sigue la cadena de imports hasta los componentes hoja. Detecta:
   - Imports pesados en rutas críticas (`moment`, `lodash`, iconos completos)
   - Ciclos de imports
   - Barrel files en el camino crítico

2. **Trazado de re-renders:** Para las 5 pantallas más críticas, analiza:
   - ¿Qué props cambian con más frecuencia?
   - ¿Qué contextos consumen?
   - ¿Qué hooks devuelven valores inestables (objetos/arrays recreados)?

3. **Trazado de red:** Para cada llamada a API:
   - ¿Se podría paralelizar?
   - ¿Se podría cachear?
   - ¿Se podría cancelar?
   - ¿Cuál es el tamaño de la respuesta? ¿Hay over-fetching (GraphQL sin selectores, REST sin `fields`)?

4. **Auditoría de assets:**
   - Tamaño total de `assets/`
   - Imágenes > 500KB
   - Fuentes > 200KB
   - Videos o audio sin comprimir

5. **Auditoría de dependencias:**
   - `npx depcheck` → dependencias no usadas
   - `npx npm-check-updates` → versiones desactualizadas con mejoras de rendimiento
   - Duplicados en `node_modules` (versiones múltiples del mismo paquete)

6. **Auditoría de configuración nativa:**
   - `android/app/build.gradle` → `enableProguardInReleaseBuilds`, `enableSeparateBuildPerCPUArchitecture`, `hermesEnabled`
   - `ios/Podfile` → `use_frameworks!`, flags de optimización
   - `app.json` → `jsEngine`, `newArchEnabled`, `updates`, `assetBundlePatterns`

7. **Auditoría de estilos:**
   - `rg "StyleSheet.create"` vs estilos inline
   - Duplicación de estilos
   - Uso de `styled-components` / `nativewind` (impacto en render)

---

## 📋 FASE 3 — Clasificación y Priorización

Para cada hallazgo, asígnale:

| Campo | Descripción |
| :--- | :--- |
| **ID** | `PERF-001`, `PERF-002`, ... |
| **Categoría** | Una de las 9 |
| **Regla violada** | Prefijo de la skill (ej: `list-use-flashlist`) |
| **Severidad** | CRÍTICO / ALTO / MEDIO / BAJO |
| **Archivo** | Ruta relativa |
| **Línea(s)** | Rango |
| **Evidencia** | Fragmento de código (máx. 10 líneas) |
| **Impacto** | Qué se degrada: arranque, FPS, memoria, red, bundle |
| **Fix propuesto** | Cambio concreto (código si aplica) |
| **Esfuerzo** | S / M / L |
| **Riesgo** | Bajo / Medio / Alto (probabilidad de romper algo) |
| **Requiere medición** | Sí/No (si no puedes verificarlo sin profiler) |

**Ordena los hallazgos por `severidad × impacto × esfuerzo inverso`.** Los CRÍTICOS con fix S van primero.

---

## 📤 FASE 4 — Formato de Salida Obligatorio

Tu respuesta debe seguir **exactamente** esta estructura:

```markdown
# Auditoría de Rendimiento — <nombre del proyecto>

## 0. Resumen Ejecutivo
- Stack: Expo <versión>, RN <versión>, Hermes <sí/no>, New Arch <sí/no>
- Total de hallazgos: X (Críticos: A, Altos: B, Medios: C, Bajos: D)
- Top 3 problemas más impactantes
- Estado general: 🔴 Crítico / 🟠 Necesita trabajo / 🟡 Mejorable / 🟢 Sano

## 1. Mapa del Proyecto
<Resumen de Fase 0>

## 2. Hallazgos por Categoría

### 🔴 1. Arranque (`launch-`)
| ID | Regla | Severidad | Archivo:Línea | Evidencia | Fix |
|----|-------|-----------|---------------|-----------|-----|
| ... |

<Detalle de cada hallazgo con código>

### 🔴 2. Bundle (`bundle-`)
...

### 🟠 3. Listas (`list-`)
...

### 🟠 4. Imágenes (`image-`)
...

### 🟠 5. Data (`data-`)
...

### 🟡 6. Navegación (`nav-`)
...

### 🟡 7. Re-renders (`rerender-`)
...

### 🟡 8. Animaciones (`anim-`)
...

### 🔵 9. Memoria (`mem-`)
...

## 3. Problemas Transversales
<Barrel files globales, deps duplicadas, configuración nativa, etc.>

## 4. Plan de Acción Recomendado
### Sprint 1 (Críticos)
1. PERF-001: ...
2. ...

### Sprint 2 (Altos)
...

### Sprint 3 (Medios)
...

## 5. Medición Recomendada
<Qué medir, con qué herramienta, qué KPI objetivo>

## 6. Anexos
- Archivos auditados: X
- Archivos no auditables: Y (razón)
- Comandos ejecutados: ...
```

---

## 🚫 Reglas de Conducta para el Agente

1. **NO inventes problemas.** Si no encuentras un archivo o un patrón, dilo. No rellenes con genéricos.
2. **NO des sugerencias genéricas.** Cada hallazgo debe tener archivo, línea y evidencia.
3. **NO asumas.** Lee el código. Si no puedes, márcalo como "requiere lectura manual".
4. **NO omitas categorías.** Si una categoría no aplica al proyecto (ej: no hay animaciones), dilo explícitamente y pasa a la siguiente.
5. **SÍ profundiza.** Si un archivo es grande (>500 líneas), léelo completo. Los problemas suelen estar en los detalles.
6. **SÍ mide cuando puedas.** Si tienes acceso a `npx expo export --analyze`, `npx depcheck`, `npx react-native-bundle-visualizer`, ejecútalos.
7. **SÍ prioriza.** No todos los hallazgos valen lo mismo. Un `ScrollView` con 500 ítems es más grave que un `console.log`.
8. **SÍ propón fixes concretos.** No digas "usar FlashList". Di: `Reemplazar <FlatList data={items} renderItem={renderItem} /> en src/screens/Home.tsx:42 por <FlashList data={items} renderItem={renderItem} estimatedItemSize={80} />`.

---

## 📚 Skills de Referencia (aplícalas todas)

| Skill | Repositorio | Categorías |
| :--- | :--- | :--- |
| `expo-react-native-performance` | `pproenca/dot-skills` | Todas (54 reglas) |
| `react-native-skills` | `vercel-labs/agent-skills` | Listas, animaciones, UI |
| `react-native-best-practices` | `callstackincubator/agent-skills` | Diagnóstico, Hermes, TurboModules |
| `optimising-expo-react-native-performance` | `tristanmanchester/agent-skills` | KPIs, presupuestos, CI |
| `react-native-dev` (performance.md) | `MiniMax-AI/skills` | Diagnóstico JS/nativo |

---

## 🏁 Criterio de "Trabajo Completo"

Considera la auditoría terminada solo cuando:

- [ ] Has leído `package.json`, `app.json`, `babel.config.js`, `metro.config.js`, `tsconfig.json`.
- [ ] Has listado el árbol completo de `app/` + `src/`.
- [ ] Has revisado **todas** las pantallas y componentes de nivel superior.
- [ ] Has cubierto las **9 categorías** sin excepción.
- [ ] Cada hallazgo tiene archivo, línea, evidencia y fix.
- [ ] Has ejecutado (si es posible) `depcheck`, `expo export --analyze`, y búsqueda de duplicados.
- [ ] Has generado el informe en el formato obligatorio.
- [ ] Has priorizado los hallazgos en un plan de acción de 3 sprints.

**Si no cumples todos los checkboxes, la auditoría está incompleta.**

---

**FIN DEL PROTOCOLO. Empieza por la FASE 0.**
```
