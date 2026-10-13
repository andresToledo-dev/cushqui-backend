# MEMORY.md - Cushqui Backend

## Estado actual
- **Tests unitarios**: 63/63 pasando ✅ · e2e no ejecutados tras los últimos cambios (necesitan BD dev con seed)
- **Repo git** inicializado en local (`main` + `dev`), **sin remoto todavía**
- **Despliegue preparado, pendiente de cuentas** (ver `DEPLOY.md`): resetear BD dev, crear proyecto Supabase prod, repo GitHub, proyecto Vercel, secretos
- La contraseña de la BD actual (futura dev) estuvo en archivos del proyecto → hay que cambiarla en Supabase
- La migración `20261013120000_account_movements` aún NO está aplicada en ninguna BD (se aplicará con el reset de dev y el primer deploy de prod)

## Decisiones y porque

| Decisión | Razón |
|----------|-------|
| `JwtAuthGuard` extiende `AuthGuard('jwt')`; `@Public()` se evalúa dentro | El guard anterior no disparaba Passport. |
| Un único `balance` + tabla `account_movements` (OPENING/ADJUSTMENT/TRANSFER) | `transactions` = solo INCOME/EXPENSE; cada cambio de saldo deja rastro para encontrar discrepancias con el banco. |
| Solo TRANSFER editable, sin registro de la edición | Pedido explícito del usuario. |
| Solo prod en Vercel; local siempre contra BD dev | El usuario no quiere un despliegue dev (recursos). |
| Deploy prod automático por GitHub Action al merge a `main` (migrar → desplegar); `npm run deploy:prod` como respaldo | Las migraciones siempre antes que el código; credenciales prod fuera del PC. Vercel con `git.deploymentEnabled: false`. |
| Vercel: `api/index.js` → `dist/serverless.js` (compilado por `nest build`) | Evita que Vercel compile TS con decoradores; la app Nest se cachea por instancia. |
| `tsconfig.build.json` con `rootDir: src` e `incremental: false` | Antes `dist/` tenía `src/` dentro (`start:prod` roto) y el `.tsbuildinfo` hacía que un 2º build no emitiera nada. |
| Protección e2e por `PROD_DB_REF` (project-ref), no por host | Dev y prod comparten el host del pooler de Supabase. |
| `scripts/deploy-prod.js` usa `process.loadEnvFile` (Node ≥20.12) | Sin dependencia extra (`dotenv-cli`). |

## Errores a evitar
- Reglas de saldo/movimientos, ambientes, defaults en DTOs, migraciones con renombres y EPERM de Prisma → en `AGENTS.md`.
- Antes de cada commit: buscar secretos (`git grep`); ya apareció un token Shortcut hardcodeado en un e2e.

## Proximos pasos
- [ ] Completar `DEPLOY.md` (cuentas) y primer despliegue
- [ ] e2e independientes del seed (crear su propio usuario/cuentas)
- [ ] `GET /accounts/:id/reconciliation` · valorar quitar chequeo de fondos en transferencias
- [ ] Quitar el default `currency = 'EUR'` de `CreateAccountDto` (bug PartialType)
- [ ] `AllExceptionsFilter` registra stack completo en 401/404: ruido en logs de Vercel
