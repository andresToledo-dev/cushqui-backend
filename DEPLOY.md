# Despliegue: GitHub + Vercel (prod) + Supabase (dev / prod)

| Ambiente | Rama | Corre en | Base de datos | Variables |
| --- | --- | --- | --- | --- |
| Local | `dev`, `feature/*` | Tu PC | Supabase **dev** | `.env` |
| Producción | `main` | Vercel | Supabase **prod** | Vercel + GitHub Environment `production` |

Al hacer merge a `main`, `.github/workflows/deploy-prod.yml` pasa los tests, aplica las migraciones a la BD **prod** y después despliega en Vercel. Vercel no despliega solo al recibir un push (`vercel.json` → `git.deploymentEnabled: false`), así el código nuevo nunca llega antes que sus tablas.

---

## Configuración inicial (una sola vez)

### 1. Supabase dev (proyecto actual)
1. **Settings → Database → Reset database password** (la anterior estuvo escrita en archivos del proyecto).
2. **Connect** (botón superior) → copia dos cadenas y ponlas en tu `.env` local (ver `.env.example`):
   - `DATABASE_URL` → *Transaction pooler* (puerto **6543**) y añade `?pgbouncer=true&connection_limit=1`.
   - `DIRECT_URL` → *Session pooler* (puerto **5432**).
3. Deja las tablas vacías y al día con las migraciones (⚠️ **borra todos los datos actuales**):
   ```bash
   npm run db:reset:dev
   ```

### 2. Supabase prod (proyecto nuevo)
1. **New project** → `cushqui-prod`, misma región que dev, contraseña nueva (guárdala en tu gestor de contraseñas).
2. Copia sus `DATABASE_URL` y `DIRECT_URL` igual que en dev, pero a un archivo `.env.production` (ignorado por git).
3. Copia su **Reference ID** (Settings → General) en tu `.env` local como `PROD_DB_REF`: los tests e2e se negarán a correr contra prod.

Las tablas de prod se crean solas en el primer despliegue (paso 5). Si quieres crearlas ya: `npm run db:deploy:prod` (desde `main`).

### 3. GitHub
1. Crea un repositorio **privado** vacío `cushqui-backend` (sin README ni .gitignore).
2. Sube el código (las ramas `main` y `dev` ya existen en local):
   ```bash
   git remote add origin https://github.com/<usuario>/cushqui-backend.git
   git push -u origin main
   git push -u origin dev
   ```
3. **Settings → Branches → Add branch ruleset** para `main` y `dev`: *Require a pull request before merging* + *Require status checks to pass* → `checks` (aparece tras el primer PR).
4. **Settings → General → Default branch** → `dev` (los PR se abren contra `dev` por defecto).

### 4. Vercel
1. **Add New → Project → Import** el repo de GitHub. *Framework Preset*: **Other** (los comandos los toma de `vercel.json`).
2. Antes de desplegar, **Settings → Environment Variables**, solo en **Production**:

   | Variable | Valor |
   | --- | --- |
   | `DATABASE_URL` | transaction pooler de **prod** |
   | `DIRECT_URL` | session pooler de **prod** |
   | `JWT_SECRET` | nuevo: `openssl rand -base64 64` |
   | `JWT_REFRESH_SECRET` | nuevo y distinto |
   | `JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | `15m` / `7d` |
   | `NODE_ENV` | `production` |
   | `API_PREFIX` | `api/v1` |
   | `CORS_ORIGINS` | dominio(s) de tu frontend, separados por coma |

3. **Settings → General → Node.js Version** → 22.x.
4. En tu PC, enlaza el proyecto y anota los IDs:
   ```bash
   npx vercel login
   npx vercel link          # crea .vercel/project.json (ignorado por git)
   ```
   `orgId` y `projectId` están en `.vercel/project.json`.
5. **Account Settings → Tokens → Create** → token para GitHub Actions.

### 5. GitHub Environment `production`
**Settings → Environments → New environment** → `production` → *Environment secrets*:

| Secret | Valor |
| --- | --- |
| `PROD_DATABASE_URL` | transaction pooler de prod |
| `PROD_DIRECT_URL` | session pooler de prod |
| `VERCEL_TOKEN` | token del paso 4.5 |
| `VERCEL_ORG_ID` | `orgId` |
| `VERCEL_PROJECT_ID` | `projectId` |

Opcional: *Required reviewers* → tú mismo, para aprobar cada despliegue a producción.

### 6. Primer despliegue
**Actions → Deploy production → Run workflow** (rama `main`). Al terminar:
- `https://<proyecto>.vercel.app/api/v1/health` → 200
- Supabase prod → *Table Editor*: tablas vacías y `_prisma_migrations` con todas las migraciones.

---

## Día a día

```bash
git checkout dev && git pull
git checkout -b feature/mi-cambio

# Si cambias prisma/schema.prisma:
npm run db:migrate:dev        # crea la migración y la aplica a BD dev (commitea la carpeta nueva)

npm run start:dev             # pruebas locales contra BD dev
git push -u origin feature/mi-cambio
```
1. PR `feature/mi-cambio → dev` → CI en verde → merge.
2. PR `dev → main` → CI en verde → merge → despliegue automático a producción.

**Despliegue manual de respaldo** (si la Action no está disponible): desde `main` al día y sin cambios pendientes, con `.env.production` completo y `npx vercel login` hecho:
```bash
npm run deploy:prod       # tests → migraciones BD prod → vercel deploy --prod
npm run db:deploy:prod    # solo migraciones BD prod
```

## Reglas
- Nunca `migrate dev`, `migrate reset` ni `prisma:seed` contra prod.
- Nunca escribir contraseñas, tokens ni URLs reales en archivos versionados.
- Tests e2e: solo contra dev, y necesitan el seed (`npm run prisma:seed`).
- Supabase gratis pausa los proyectos tras ~1 semana sin uso: reactivar desde el dashboard.
