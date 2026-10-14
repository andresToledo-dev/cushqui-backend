# MEMORY.md - Cushqui Backend

## Estado actual
- **Tests unitarios**: 65/65 pasando ✅ · e2e no ejecutados tras los últimos cambios (necesitan BD dev con seed)
- Repo en GitHub (`main` producción en Vercel, `dev` por defecto). Producción desplegada: `https://cushqui-backend.vercel.app`
- **Importación Excel**: ejecución `import-2026-10-13_21-11-51_execute` detenida en Gastos!1521 (P2028, no guardada) con 1185/2943 importadas. Causa: pooler 6543 (~0,5 s/consulta) + `connection_limit=1` + maxWait 2 s. Arreglado (session pooler local + transactionOptions). Pendiente: `npm run import:resume import-2026-10-13_21-11-51_execute` (no usar `-- --flag`: PowerShell 5.1 quita el `--`) (lo lanza el usuario o con su permiso explícito)
- **Rama `feature/category-type`** (sin commit): `type` en categorías + color de subcategoría desde el frontend. Migración `20261014120000_category_type` **sin aplicar** (probada con ROLLBACK sobre la BD dev); hasta aplicarla, la API local da 500 en categorías
- Script de importación, `openingDate`/`date` y `transactionOptions` en rama `feature/excel-import` (PR a `dev` y luego a `main`)

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
| Editar transacción: se valida el resultado final (tipo + categoría) y el saldo se revierte y reaplica | Pedido del usuario: gasto 20 → ingreso 20 lleva el saldo de 60 a 100. |

## Errores a evitar
- Reglas de saldo/movimientos, ambientes, importación, defaults en DTOs y migraciones → en `AGENTS.md`.
- Antes de cada commit: buscar secretos (`git grep`). `scripts/imports/` y `scripts/import.env` nunca se versionan.
- Variables de Vercel: revisar nombre ≠ valor (`API_PREFIX` tenía el valor `API_PREFIX` → todas las rutas 404).
- `POST /auth/refresh` está roto (DTO exige UUID y el token es JWT): el script de importación re-loguea en su lugar.

## Proximos pasos
- [ ] Importación real tras corregir el Excel (simulación sin errores primero)
- [ ] Arreglar `RefreshTokenDto` (`@IsUUID` → JWT) · e2e independientes del seed
- [ ] `GET /accounts/:id/reconciliation` · quitar default `currency = 'EUR'` de `CreateAccountDto`
