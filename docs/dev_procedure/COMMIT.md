# COMMIT.md - Especificación para Generación de Commits

> **Instrucción Obligatoria para el Agente:** Este documento define las reglas ESTRICTAS que debes seguir al generar cualquier mensaje de commit. Las reglas de formato, semántica e **IDIOMA** descritas aquí tienen prioridad absoluta sobre cualquier otra instrucción implícita o conversacional.

---

## 0. REGLA DE ORO - IDIOMA (NIVEL CRÍTICO)

**Todos los mensajes de commit (asunto, cuerpo y pie) DEBEN ser redactados EXCLUSIVAMENTE en INGLÉS.**

- **Prohibido** usar español, portugués, francés o cualquier otro idioma en el mensaje final.
- Los únicos caracteres permitidos fuera del inglés son los nombres propios o URLs, pero la narrativa del commit debe ser 100% en inglés.
- **Razón:** Mantener un historial universal, facilitar la colaboración global y la integración con herramientas de IA y análisis semántico.

---

## 1. Formato Estándar (Conventional Commits)

Todos los mensajes deben seguir esta estructura exacta:

```
<tipo>(<alcance>): <asunto>
<LINEA_EN_BLANCO>
<cuerpo>
<LINEA_EN_BLANCO>
<pie>
```

### 1.1. Tipos Permitidos (`type`)
Usa **SOLO** uno de los siguientes tipos semánticos (siempre en minúscula):

| Tipo | Emoji | Uso (Contexto) |
| :--- | :--- | :--- |
| `feat` | ✨ | Nuevas funcionalidades o características para el usuario. |
| `fix` | 🐛 | Corrección de un bug o error en producción. |
| `docs` | 📝 | Cambios exclusivos en la documentación (README, JSDoc, comentarios). |
| `style` | 💄 | Cambios que no afectan la lógica (espacios, puntos y comas, formato, linting). |
| `refactor` | ♻️ | Cambios en el código que no arreglan bugs ni añaden features (optimización, legibilidad). |
| `perf` | ⚡ | Cambios que mejoran el rendimiento (performance). |
| `test` | ✅ | Añadir o corregir pruebas unitarias / e2e. |
| `build` | 📦 | Cambios en el sistema de compilación o dependencias externas (webpack, npm, gradle). |
| `ci` | 👷 | Cambios en la configuración de integración continua (GitHub Actions, Jenkins). |
| `chore` | 🔧 | Tareas de mantenimiento que no modifican código fuente ni tests (actualización de dependencias). |
| `revert` | ⏪ | Deshacer un commit anterior. |

### 1.2. El Asunto (`subject`) - **EN INGLÉS**
- **Máximo 50 caracteres.**
- **Verbo en imperativo presente:** Ej: "Add", "Fix", "Update", "Remove", "Refactor".
- **No terminar con punto.**
- **Primera letra en mayúscula** (ej: `Fix login validation`).
- **Sin artículos innecesarios** al inicio (evita "Add a...", usa "Add...").

### 1.3. El Alcance (`scope`) - *Opcional pero recomendado*
Indica el módulo, archivo o capa afectada (ej: `auth`, `api`, `ui`, `database`, `payment`). Si aplica a varios, omítelo o usa `*`.

### 1.4. El Cuerpo (`body`) - **EN INGLÉS**
- **Líneas envueltas a 72 caracteres.**
- Explica **QUÉ** se cambió y **POR QUÉ** se cambió.
- **Prohibido** explicar el *cómo* (el código ya lo hace).
- Debe incluir el contexto de la decisión (ej: "To prevent timeout errors on large payloads...").

### 1.5. El Pie (`footer`) - **EN INGLÉS**
- Usado para:
  - **Breaking Changes:** `BREAKING CHANGE: <description>` (siempre en mayúsculas).
  - **Cierre de Issues:** `Closes #123`, `Fixes #456`.

---

## 2. Reglas de Oro (Best Practices)

1. **Idioma Obligatorio:** Repetido por énfasis: **100% INGLÉS** en todo el mensaje.
2. **Atomicidad (REGLa POR DEFECTO / IMPLÍCITA):** Un commit representa SIEMPRE un **único cambio lógico**. Esta es la opción predeterminada y no requiere justificación: cada feature, fix, refactor o doc va en su propio commit atómico. Si arreglas un bug y actualizas la documentación en el mismo archivo, haz dos commits separados. La única excepción permitida es cuando el usuario lo solicita explícitamente ("single commit"), y aun así el mensaje debe ser en inglés.
3. **No mezcles:** No combines un `feat` con un `fix` en el mismo commit.
4. **El cuerpo es obligatorio** si el `subject` no describe completamente el cambio.
5. **Creación local sin confirmación:** Crear commits locales (`git add` + `git commit`) **no** requiere confirmación del usuario: es una operación local, atómica y reversible. La **única** operación que exige confirmación explícita es `git push` (ver Sección 6).

---

## 3. Ejemplos Prácticos para el Agente

### ❌ MALO (Rechazar - por idioma o formato)
```
fixed stuff
```
```
actualizado el codigo de login
```
```
feat: muchas cosas cambiadas y arregladas y ademas docs
```
```
feat(auth): se agregó recuperación de contraseña (Idioma incorrecto)
```

### ✅ BUENO (Aceptar - 100% en inglés)

**Ejemplo 1 (Feature con cuerpo):**
```
feat(auth): add password reset via email

Implements a secure token-based flow to reset user passwords.
The token expires after 15 minutes to mitigate interception risks.

Closes #42
```

**Ejemplo 2 (Fix con breaking change):**
```
fix(api): handle empty payloads in user update

Prevents the server from throwing a 500 error when the client sends an empty object.
Instead, returns a 204 No Content status.

BREAKING CHANGE: The PATCH /users endpoint now requires a valid JSON body.
```

**Ejemplo 3 (Docs simple - sin cuerpo porque es obvio):**
```
docs(readme): update installation steps for Node v20
```

**Ejemplo 4 (Refactor sin cuerpo):**
```
refactor(utils): simplify date formatting logic
```

**Ejemplo 5 (Chore - actualización de dependencias):**
```
chore(deps): bump axios from 1.6.0 to 1.7.0
```

---

## 4. Flujo de Trabajo para el Agente (Instrucción Directa)

Cuando recibas el comando para hacer un commit, ejecuta este flujo mental:

1. **Analiza el diff** (`git diff --staged` o los cambios actuales).
2. **Agrupa por cambio lógico (ATÓMICO POR DEFECTO):** Separa los cambios en commits independientes por feature, fix, refactor o doc. Nunca mezcles tipos; si un grupo tiene tanto código como docs de la misma feature, prioriza el código en un commit y la doc en otro salvo que la doc sea estrictamente parte del mismo átomo.
3. **Clasifica** cada grupo en un solo `tipo` de la tabla de la Sección 1.1.
4. **Redacta el asunto en inglés** en menos de 50 caracteres usando el imperativo presente.
4. **Pregúntate:** *"¿Alguien que lea esto sabrá por qué hice este cambio?"* Si la respuesta es "no", escribe un cuerpo detallado en inglés.
5. **Verifica** que no haya puntos al final, que el cuerpo esté envuelto a 72 caracteres y que **no aparezca ni una sola palabra en español**.
6. **Entrega el mensaje completo** (o los mensajes, si son múltiples commits atómicos) listo para ser usado con `git commit -m "..." -m "..."`.

---

## 5. Validación Automática (Opcional pero recomendada)
Para forzar estas reglas en el CI/CD, instala:
- **Commitlint:** `commitlint -g @commitlint/config-conventional`
- **Husky:** Para validar pre-commit y rechazar automáticamente commits que no estén en inglés o no sigan el formato.

---

## 6. REGLA DE SEGURIDAD - CONFIRMACIÓN ANTES DEL PUSH (NIVEL OBLIGATORIO)

**El agente tiene ABSOLUTAMENTE PROHIBIDO ejecutar `git push` sin una confirmación explícita del usuario.**

### 6.1. Flujo obligatorio post-commit:
1. **Después** de generar el/los commit(s) localmente —operación que el agente ejecuta directamente y sin confirmación previa, según la regla 5 de la Sección 2—, el agente **DEBE** mostrar al usuario el mensaje de commit completo (o la lista de commits generados).
2. **Inmediatamente después**, el agente **DEBE** realizar una pregunta de confirmación clara y esperar la respuesta del usuario.
3. **Solo** si el usuario responde afirmativamente (ej: *"yes"*, *"approve"*, *"ok"*, *"si"*, *"confirmo"*), el agente procederá a ejecutar `git push`.
4. Si el usuario responde negativamente (ej: *"no"*, *"cancel"*, *"deny"*), el agente **DEBE** abortar la operación de push y notificar al usuario que los cambios permanecen solo en el repositorio local.

### 6.2. Ejemplo de interacción obligatoria:
> **Agente:** "The following commit(s) are ready to be pushed to the remote repository:  
> `feat(auth): add password reset via email`  
> `docs(readme): update setup steps`  
> Do you approve these commits and want to push them to the remote? (yes/no)"

> **Usuario:** "yes" → *(El agente ejecuta `git push`)*  
> **Usuario:** "no" → *(El agente cancela el push y responde: "Push aborted. Changes remain local.")*

### 6.3. Excepción:
- **Ninguna.** Ni siquiera si el usuario dijo "haz commit y push" en el mensaje inicial. El agente **SIEMPRE** debe mostrar el mensaje final y pedir confirmación antes del push, para evitar arrepentimientos o errores de último minuto.

---

*Fin de la especificación. El agente debe cumplir estas reglas rigurosamente. Recordatorio final: **Commits en inglés** + **Confirmación obligatoria antes del push**.*