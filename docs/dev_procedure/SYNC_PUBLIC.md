> **LEE ESTO PRIMERO, AGENTE.**
>
> Este archivo es un **protocolo de ejecución obligatorio**, no una guía. El usuario lo invocó (adjuntando o nombrando este archivo). Ejecutalo ahora.
>
> Objetivo: copiar el árbol de trabajo actual al clon **público** `SeveralTool/pkey`, commitear un snapshot limpio, sellar integridad y pushear. El historial de `pkey-dev` no se publica.

---

## 0. Qué está permitido

| Acción | ¿Sí? |
|--------|------|
| `npm run sync:public` hacia el clon público | Sí |
| `git add` / `git commit` / `git push` **solo** en el clon público | Sí (este comando lo autoriza) |
| Force-push, `--mirror`, push a `pkey-dev` | **No** |
| `eas build`, `gradlew`, `npm run build:apk` | **No** ([AGENTS.md](../../AGENTS.md)) |
| Commits en el working tree de desarrollo (`c:\proyects\pkey`) | **No**, salvo que el usuario lo pida aparte |
| Mensajes de commit | Inglés, Conventional Commits ([COMMIT.md](./COMMIT.md)): `chore: public audit snapshot` y `chore: stamp build integrity` |

---

## 1. Rutas

- **Fuente (este repo de trabajo):** raíz del clone donde estás. Típicamente `c:\proyects\pkey`.
- **Destino (público):** `c:\proyects\pkey-public` (clon de `git@github.com:SeveralTool/pkey.git`).

Si el destino no existe:

```powershell
git clone git@github.com:SeveralTool/pkey.git C:\proyects\pkey-public
```

Antes de copiar, en el destino:

```powershell
git -C C:\proyects\pkey-public remote get-url origin
```

Debe ser `SeveralTool/pkey` (público). Si apunta a `pkey-dev`, **abortá**.

La fuente **no** puede ser el mismo path que el destino.

---

## 2. Copiar el árbol

Desde la **fuente**:

```powershell
npm run sync:public -- C:\proyects\pkey-public
```

Eso excluye `.git`, `archive/`, `node_modules`, `/android`, `/ios` generados, keystores, `.env`, dumps de test. No inventes otra lista.

---

## 3. Commit del snapshot (clon público)

```powershell
cd C:\proyects\pkey-public
git add -A
git status
```

- Si no hay cambios: decí “público ya está al día” y **no** crees commits vacíos. Fin.
- Si hay cambios: commit **en inglés**:

```text
chore: public audit snapshot
```

Cuerpo opcional de una línea: qué cambió, sin secretos.

**No** `git commit --amend` salvo las reglas de [COMMIT.md](./COMMIT.md) / el protocolo de git del usuario.

---

## 4. Sello de integridad (clon público)

El SHA de Settings tiene que existir en GitHub **público**.

```powershell
npm run stamp:integrity
git add app.json
git commit -m "chore: stamp build integrity"
```

Si `app.json` no cambió, no fuerces un segundo commit.

---

## 5. Push

```powershell
git push origin main
```

Solo `origin` del clon **público**. Si `main` no existe, usá la rama que ya trackea `SeveralTool/pkey` (`git branch -vv`).

GitHub Pages (legales) se regenera solo si cambió `docs/legal/`, `LICENSE` o `legal-site/`. No hace falta un paso extra.

---

## 6. Informe al usuario (obligatorio)

Al terminar, listá:

1. SHA del snapshot y SHA del stamp (`git rev-parse HEAD` y el `commit` dentro de `app.json` → `expo.extra.buildIntegrity`).
2. URL: https://github.com/SeveralTool/pkey
3. Que **no** corriste EAS.
4. Si quieren AAB de tienda, el comando (ellos lo corren):

```text
cd C:\proyects\pkey-public
npm ci
npm run prebuild:mobile
eas build --profile production --platform android
```

---

## 7. Si algo falla

- Destino = fuente, o remote ≠ `SeveralTool/pkey` → parar.
- `git push` rechazado → no force. Decí que hay que `git pull --rebase` en el clon público o que lo revise el usuario.
- Secretos (`.jks`, tokens) en el `git status` del público → **no** commitees; sacalos y avisá.
