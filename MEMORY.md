# MEMORY.md - Cushqui Backend

## Estado actual
- **Tests**: unitarios 95/95 ✅ · e2e 88/88 ✅ (dos veces seguidas, 2026-10-19). BD dev limpiada después: **solo queda `test@roto.com`** (copias en `scripts/imports/db-clean-backup-*.json`). Para volver a correr e2e: seed → e2e → `db:clean:dev:execute test@roto.com`
- Repo en GitHub (`main` producción en Vercel región `dub1`, `dev` por defecto). Producción: `https://cushqui-backend.vercel.app`
- Importación Excel en dev completada (`test@roto.com`, luego con datos de prueba). **Carga en producción** (`--prod`, fusionado en `main`): pendiente de que el usuario se registre en la app y lance `npm run import:prod:execute` (~40 min estimados)
- **Rama `feature/manual-import`** (sin commit, sin PR hasta cerrar el tema de tests): `IntegrationType.MANUAL` + `POST /imports/manual`; categorías por usuario (`userId` NOT NULL, categorías base al registrarse) y `scripts/clean-dev-db.ts`. Migraciones `…_integration_type_manual` y `…_category_user_required` **aplicadas en dev**; la segunda aborta en prod si hubiera categorías sin usuario
- Pendiente: decidir la estrategia de e2e (propuesta: BD de test aparte + usuario propio por suite)
- `Task1.md` eliminado del historial; quedan `refs/original` locales y copia en `%TEMP%\cushqui-history-backup-20261014-191722\` (limpieza pendiente, ofrecida)

## Decisiones y porque

| Decisión | Razón |
|----------|-------|
| Un único `balance` + tabla `account_movements` (OPENING/ADJUSTMENT/TRANSFER) | `transactions` = solo INCOME/EXPENSE; cada cambio de saldo deja rastro para encontrar discrepancias con el banco. |
| Solo TRANSFER editable, sin registro de la edición | Pedido explícito del usuario. |
| Deploy prod por GitHub Action al merge a `main` (migrar → desplegar), solo desde `main` | Migraciones antes que el código; Vercel con `git.deploymentEnabled: false`. |
| Vercel: `api/index.js` → `dist/serverless.js`; `.vercelignore` NO excluye `dist`/`node_modules` | El deploy `--prebuilt` subía la función sin `dist/`. |
| `openingDate` (POST /accounts) y `date` (POST /accounts/:id/adjustments) opcionales | Importar historial sin perder fechas; elegido por el usuario frente a usar la fecha de hoy. |
| Import: fechas sin hora → 12:00 UTC + 1 s por operación del día | Evita cambiar de día por zona horaria, conserva el orden y hace única cada operación (verificación de fallos ambiguos). |
| Import: orden en el día OPENING → INCOME → TRANSFER → EXPENSE → ADJUSTMENT; mismo tipo por fila descendente | Las hojas listan lo más nuevo primero; maximiza saldo para transferencias (la API las rechaza sin fondos). |
| Import: subcategoría de Prestamos solo si el comentario empieza por `Nombre:` | Regla del usuario; el resto queda en Prestamos sin subcategoría. Cuenta `Bitcoin Uphold` (nombre del Excel). |
| `Category.type` reutiliza `TransactionType`; subcategorías heredan el tipo | Comparación directa con el tipo de la transacción; una subcategoría nunca puede diferir del padre. |
| Migración divide categorías usadas por gastos e ingresos (Cortes, Otros, Inversion) en dos | Elegido por el usuario: no deja transacciones con categoría de otro tipo. Aborta si queda alguna incoherencia. |
| Import manual: tipo explícito (`type`), nuevo `IntegrationType.MANUAL`, cuenta por `accountId` o `accountName` | Elegido por el usuario. Cada token solo vale para su endpoint (403). Sin `externalId` no se deduplica. |
| Sin categorías globales; categorías base por usuario al registrarse | Pedido del usuario: cada uno edita/borra las suyas. Los nombres coinciden con el mapeo del Excel: la importación las reutiliza. |
| Editar transacción: se valida el resultado final (tipo + categoría) y el saldo se revierte y reaplica | Pedido del usuario: gasto 20 → ingreso 20 lleva el saldo de 60 a 100. |

## Errores a evitar
- Al cambiar de rama o tras un merge con cambios en `schema.prisma`: parar `start:dev` y `npx prisma generate` (un generate con EPERM deja tipos viejos → errores de compilación). El seed de una rama vieja falla contra la BD migrada (categorías `userId` null).
- **Nunca `vercel build` en el proyecto local**: corre `npm ci` y borró `node_modules`. Si hace falta, en una copia (`git archive` a `%TEMP%`).
- Reglas de saldo/movimientos, ambientes, importación, defaults en DTOs y migraciones → en `AGENTS.md`.
- Antes de cada commit: buscar secretos (`git grep`). `scripts/imports/` y `scripts/import.env` nunca se versionan.
- Variables de Vercel: revisar nombre ≠ valor (`API_PREFIX` tenía el valor `API_PREFIX` → todas las rutas 404).
- `POST /auth/refresh`: el DTO exigía UUID y el token es JWT (toda renovación daba 400 y la app cerraba sesión a los 15 min). Corregido con `@IsJWT()` en rama `fix/refresh-token-jwt`

## Proximos pasos
- [ ] Importación real tras corregir el Excel (simulación sin errores primero)
- [ ] e2e independientes del seed
- [ ] `GET /accounts/:id/reconciliation` · quitar default `currency = 'EUR'` de `CreateAccountDto`
