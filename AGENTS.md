# Cushqui Backend - Instrucciones para Agentes

## Comandos Rápidos

```bash
# Instalar dependencias (ejecuta prisma generate en postinstall)
npm install

# Base de datos (siempre la BD dev de Supabase, configurada en .env)
npm run db:migrate:dev   # crea una migración nueva y la aplica a BD dev
npm run db:deploy:dev    # aplica migraciones pendientes a BD dev
npm run prisma:seed      # datos de prueba (solo dev, opcional)
npm run db:clean:dev <email>          # simulación: qué se borraría de la BD dev (todo lo que no sea de <email>)
npm run db:clean:dev:execute <email>  # lo borra (copia JSON en scripts/imports/); se niega si apunta a prod

# Invitaciones (el registro exige código; los imprime una sola vez)
npm run invite:dev [email]            # invitación USER en BD dev (con email: solo vale para ese email)
npm run invite:admin:dev [email]      # invitación ADMIN en BD dev
npm run invite:admin:prod [email]     # invitación ADMIN en BD prod (.env.production): primer admin de prod
npm run user:admin:dev <email>        # hace ADMIN a un usuario existente (user:admin:prod en prod)

# Ejecutar
npm run start:dev     # desarrollo con hot reload (BD dev)
npm run build         # build de producción

# Tests
npm test              # tests unitarios (121 tests, sin BD)
npm run test:e2e      # tests e2e (BD dev + seed; abortan si apuntan a prod)
npm run test:cov      # coverage

# Producción (normalmente automático al hacer merge a main)
npm run deploy:prod   # respaldo manual: tests + migraciones BD prod + deploy Vercel
```

## Arquitectura

**Stack**: NestJS 10, TypeScript 5, Prisma 5, PostgreSQL 15, JWT auth

**Estructura de Módulos** (`src/`):

```
auth/           # JWT auth (register con invitación, login, refresh, me)
invitations/    # Códigos de invitación (solo ADMIN)
users/          # Perfil de usuario
accounts/       # Cuentas financieras (BANK, CASH, CARD, WALLET, SAVINGS, OTHER)
categories/     # Categorías + subcategorías (globales + usuario)
transactions/   # CRUD + clasificación (UNCLASSIFIED → CLASSIFIED)
imports/        # Importación por notificación (mensaje) y manual (tipo + importe + cuenta), con deduplicación (fingerprint)
integrations/   # Tokens de integración (tipos NOTIFICATION y MANUAL)
dashboard/      # Balance, ingresos/gastos mensuales, sin clasificar
statistics/     # Por categoría, cuenta, mensual (12 meses)
transfers/      # Crear/editar transferencias entre cuentas (se guardan en account_movements)
movements/      # Historial de movimientos: aperturas, ajustes, transferencias
health/         # Health check
common/         # Guards, decorators, filters
```

## Memoria para el agente

- Al empezar, lee `MEMORY.md` para conocer el estado del proyecto y las decisiones tomadas
- Al terminar una tarea, actualizalo: estado actual, decsiones importantes (con su por que) y errores a evitar
- Mantenlo breve (maximo 50 lineas): resume o elimina lo que no aporte
- Si algo se converte en una regla permanente, propon moverlo a `AGENTS.md` en lugar de dejarlo en memoria
- No guardes nunca datos sensibles (claves, tokens, datos personales)

## Decisiones de Diseño Clave

### Autenticación

- **JWT access** (15m) + **refresh token** (7d) vía `Authorization: Bearer <accessToken>`
- `/api/v1/auth/me` retorna usuario sin `passwordHash`
- Decorador `@Public()` para rutas sin autenticación
- Decorador `@CurrentUser()` para contexto de usuario
- **Roles** (`User.role`: `USER` / `ADMIN`): `@Roles(UserRole.ADMIN)` + `RolesGuard` global (después de `JwtAuthGuard`; `request.user` se lee de la BD en cada petición, un cambio de rol aplica al momento). `/auth/me` devuelve `role`

### Registro por invitación (Crítico)

- `POST /auth/register` exige `invitationCode`. Sin código válido → 400 `Invalid or expired invitation code` (mismo mensaje si no existe, está usado, revocado, caducado o es para otro email). El código se valida **antes** que el email: sin código no se puede averiguar qué emails existen
- Códigos `XXXX-XXXX-XXXX` (sin 0/O/1/I), de un solo uso, caducan a los 7 días (1–30 con `expiresInDays`), opcionalmente ligados a un email. Se guarda solo el **SHA256** del código normalizado (mayúsculas, sin guiones): se muestra una vez. Lógica en `src/invitations/invitation-code.util.ts` (la usan API, registro y script)
- Al registrarse, el código se consume con `updateMany where usedAt null …` dentro del mismo `$transaction` que crea el usuario y sus categorías: dos registros en paralelo no pueden usar el mismo código. El usuario recibe el `role` de la invitación
- `POST/GET /invitations`, `DELETE /invitations/:id` (revocar; usada → 409): solo ADMIN. Por la API solo se crean invitaciones `USER`; las `ADMIN` solo con `scripts/invitations.ts`
- **Primer admin** (no hay ninguno en una BD nueva): `npm run invite:admin:prod <email>` → registrarse en la app con ese código. El script se niega sin `--prod` si `DATABASE_URL` contiene `PROD_DB_REF`, y con `--prod` si no lo contiene

### Importaciones por notificación y manuales (Crítico)

- Usa **token separado** (`Authorization: Bearer <INTEGRATION_TOKEN>`), NO JWT
- Crear integración vía `POST /api/v1/integrations` → retorna `plainToken` **una sola vez**
- Deduplicación vía **SHA256 fingerprint** en `ImportEvent` (único por user+account+source+amount+merchant+date+externalId)
- Retorna `{ created: true }` o `{ created: false, duplicate: true, transactionId }`
- **Cada token solo vale para su endpoint**: `NOTIFICATION` → `POST /imports/notification` (parsea el mensaje; la integración debe tener cuenta asociada), `MANUAL` → `POST /imports/manual`. Token de otro tipo → 403. Ambos tipos los usa el atajo de iOS: `NOTIFICATION` envía el texto de la notificación del banco (antes se llamaba `SHORTCUT`)
- `POST /imports/manual { type: EXPENSE|INCOME, amount > 0, accountId | accountName, date?, description?, externalId? }`: exactamente uno de `accountId` / `accountName` (nombre sin distinguir mayúsculas, solo cuentas activas; 0 → 404, varias → 409); cuenta inactiva → 400. Crea la transacción `UNCLASSIFIED` con `source: MANUAL` y la moneda de la cuenta (`description` → `merchant`), ajusta el saldo y registra el `ImportEvent`
- Import manual: **solo se deduplica si llega `externalId`** (mismo importe el mismo día es legítimo); sin él cada petición crea una transacción. La fingerprint de notificación no se toca (rompería la deduplicación de eventos ya guardados)

### Transacciones

- `transactions` contiene **solo INCOME y EXPENSE** (manuales + imports por notificación). Transferencias, aperturas y ajustes van en `account_movements`
- `amount` se guarda como **DECIMAL(19,4) positivo**; el signo viene de `type` (EXPENSE = negativo, INCOME = positivo)
- Clasificación: `POST /transactions/:id/classify` con `{ categoryId }`

### Categorías

- **Toda categoría pertenece a un usuario** (`userId` NOT NULL): no existen categorías globales. Al registrarse (`POST /auth/register`), el usuario recibe las **categorías base** de `src/categories/default-categories.ts` (`createDefaultCategories`, en la misma transacción que crea el usuario); son suyas y puede editarlas o borrarlas. El seed usa la misma función
- Categorías de otro usuario: 403 en `/categories`, 404 al usarlas en transacciones. Las categorías base tienen ids aleatorios: los tests las buscan por nombre y tipo (`findCategory` en `test/shared-test.module.ts`), nunca por id fijo
- Cada categoría tiene `type` (`TransactionType`: `EXPENSE` / `INCOME`), obligatorio al crear (`POST /categories`). El mismo nombre puede existir como gasto y como ingreso
- **Subcategorías heredan el tipo del padre**: `POST /categories/subcategories` no acepta `type`; `PATCH` de una subcategoría no puede cambiarlo. Cambiar el tipo del padre (`PATCH /categories/:id { type }`) cambia el de sus subcategorías y se rechaza si la categoría o sus subcategorías tienen transacciones
- **El color de la subcategoría lo envía el frontend** (`color` obligatorio, `#RRGGBB`); el backend ya no lo calcula. El icono sí se hereda del padre
- Transacciones: la categoría debe ser del mismo tipo que la transacción y la subcategoría hija de esa categoría (crear, editar y clasificar). Al editar se valida el resultado final: cambiar el tipo exige una categoría del nuevo tipo; cambiar de categoría sin subcategoría quita la anterior

### Saldo de cuentas (Crítico)

- `accounts` tiene **un único campo `balance`** (DECIMAL(19,4)); no existen `initialBalance` ni `currentBalance`
- `balance` es la **fuente de verdad**: no se recalcula desde transacciones (dashboard y statistics lo leen directamente). Es una guía para encontrar discrepancias con el banco real, no el saldo real
- Toda operación que afecte el saldo **debe** usar `adjustBalance(tx, accountId, delta)` de `src/accounts/account-balance.util.ts`, **dentro del mismo `$transaction`** que escribe la transacción o el movimiento
  - Transacciones (`balanceDelta(type, amount)`): Crear `+delta(nuevo)` · Borrar `-delta(viejo)` · Editar `-delta(viejo)` en la cuenta vieja y `+delta(nuevo)` en la cuenta nueva
- Nunca leer-modificar-escribir el saldo: `adjustBalance` usa `increment` atómico de Prisma
- **`PATCH /accounts/:id` no acepta `balance`**: el saldo solo cambia por transacciones o movimientos, para que todo cambio quede registrado

### Movimientos de cuenta (`account_movements`, Crítico)

- Una fila por evento, tipo `MovementType`: `OPENING`, `ADJUSTMENT`, `TRANSFER`. Se crean con `recordMovement(tx, data)` de `src/movements/movement.util.ts`
- **OPENING**: al crear la cuenta, **siempre** (incluso con 0 €), `amount = balance` inicial. `openingDate` opcional (por defecto ahora) para cuentas históricas
- `POST /accounts/:id/adjustments` acepta `date` opcional (por defecto ahora)
- **ADJUSTMENT**: `POST /accounts/:id/adjustments { balance, note? }`. `amount` **con signo** (+10 / -10) = nuevo − actual, más `balanceBefore`/`balanceAfter`. Bloqueo optimista (`updateMany where balance = actual`) → 409 si cambió en paralelo. Delta 0 no registra nada
- **TRANSFER**: una sola fila (`accountId` = origen, `toAccountId` = destino, `amount` positivo). Nunca dos filas ±
- **Solo TRANSFER es editable** (`PATCH /transfers/:id`): revertir efecto viejo + aplicar nuevo + actualizar la misma fila, **sin registrar la edición**. OPENING y ADJUSTMENT son inmutables; no hay DELETE de movimientos
- Historial: `GET /movements?accountId=&type=&from=&to=&page=&limit=`; el filtro `accountId` busca en origen **o** destino
- Una cuenta con movimientos distintos de OPENING solo se puede desactivar (soft delete), no borrar

## Ambientes y despliegue

Guía paso a paso (Supabase, GitHub, Vercel): `DEPLOY.md`.

| Ambiente | Rama | Corre en | BD | Variables |
| --- | --- | --- | --- | --- |
| Local | `dev`, `feature/*` | PC (`npm run start:dev`) | Supabase **dev** | `.env` |
| Producción | `main` | Vercel | Supabase **prod** | Vercel (runtime) + GitHub Environment `production` (migraciones) |

- Flujo: `feature/*` desde `dev` → PR a `dev` → PR `dev → main` → `.github/workflows/deploy-prod.yml` aplica `prisma migrate deploy` a BD prod y **después** despliega en Vercel. Vercel no despliega solo al hacer push (`vercel.json` → `git.deploymentEnabled: false`)
- **Nunca** ejecutar `migrate dev`, `migrate reset` ni el seed contra prod. Las migraciones de prod solo con `migrate deploy`
- Las migraciones (`prisma/migrations/`) **se versionan**: son la única forma de crear las tablas en prod
- `DATABASE_URL`: **producción (Vercel)** = pooler de transacciones (puerto 6543, `?pgbouncer=true&connection_limit=1`); **local** = session pooler (puerto 5432, `?connection_limit=5`): el 6543 añade ~0,5 s por consulta y con un servidor de larga duración provocó P2028. Nunca dejar el session pooler sin `connection_limit` (Prisma abriría CPUs×2+1 conexiones de las 60 del plan free). `DIRECT_URL` = usado por las migraciones
- Prisma: `transactionOptions { maxWait: 10s, timeout: 20s }` en `PrismaService` (los 2 s por defecto fallaban con los picos del pooler)
- **Nunca** escribir contraseñas, tokens ni URLs reales en archivos versionados (este incluido): solo en `.env` / `.env.production` (ignorados), Vercel y GitHub Secrets

Variables (ver `.env.example`): `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `PORT`, `NODE_ENV`, `API_PREFIX`, `CORS_ORIGINS`, `PROD_DB_REF` (solo local: project-ref de prod, protege los e2e), `NOTIFICATION_INTEGRATION_TOKEN` (solo local, opcional: token reutilizado por los e2e).

## Importación desde Excel (`scripts/import-transactions.ts`)

- Script puntual que importa vía la API local (nunca BD directa ni prod): `npm run import:transactions` (simulación) / `npm run import:execute` / `npm run import:resume <runId>`. No usar `npm run … -- --flag`: Windows PowerShell 5.1 elimina el `--` y npm se queda el flag (el script lo detecta y se detiene). Otras opciones: `npx ts-node scripts/import-transactions.ts …`
- Config en `scripts/import.env` y mapeo en `scripts/import-mapping.json`: **ambos ignorados por git** (credenciales, saldos reales y nombres de personas). Se versionan solo `scripts/import.env.example` y `scripts/import-mapping.example.json`
- `scripts/imports/` contiene datos personales: **ignorado por git, nunca versionar**. Cada ejecución guarda sus archivos en `scripts/imports/import-<fecha_hora local>_simulation/` o `…_execute/`: Excel con columna de resultado ("Simulación" / "Importación"), `.report.json` y, en ejecución, `.log` y `.original.xlsx` (copia intacta usada por `--resume`); `registry.json` en la raíz
- `expectedBalances` en el mapeo: saldos reales finales; si la simulación no los reproduce exactamente, `--execute` se bloquea
- La simulación **nunca escribe**: solo login + GET para mostrar el estado del usuario. Probar `--execute` solo con autorización explícita del usuario
- **Producción** (`npm run import:prod` / `import:prod:execute` / `import:prod:resume <runId>`): flag `--prod`, config en `scripts/import.prod.env` (ignorado; ver `.example`), API remota solo `https`, carpetas `…_prod_simulation` / `…_prod_execute`. **El script nunca crea usuarios en producción**: el usuario se registra desde la app y el script solo hace login (si no existe, se detiene sin enviar nada). Sin `--prod` solo se acepta la API local
- La comprobación previa (health, login, usuario vacío) se hace **antes** de registrar la ejecución en `registry.json`: un intento que falla ahí no bloquea la importación real
- Protecciones: se niega a ejecutar con filas inválidas, a reimportar el mismo Excel (hash) y a importar sobre un usuario con cuentas; un fallo ambiguo se reanuda con `--resume <runId>`, que verifica en la API antes de reenviar

## Particularidades de Testing

| Tipo Test | Comando            | Notas                                               |
| --------- | ------------------ | --------------------------------------------------- |
| Unit      | `npm test`         | 121 tests, no requiere BD (los corre la CI en cada PR) |
| E2E       | `npm run test:e2e` | BD dev con seed; abortan si `DATABASE_URL` contiene `PROD_DB_REF` |
| Coverage  | `npm run test:cov` | Salida en `coverage/`                               |

**Los tests e2e crean datos reales** y dependen del usuario/cuentas del seed (`npm run prisma:seed` en dev antes de ejecutarlos; el usuario seed es ADMIN para crear invitaciones con `createInvitation()` de `test/shared-test.module.ts`). Para dejar la BD dev solo con tus datos: `npm run db:clean:dev:execute <tu email>` (borra el usuario seed y los creados por los tests).

## Problemas Comunes

1. **Supabase gratis pausa proyectos** tras ~1 semana sin uso: reactivar desde el dashboard si la BD no responde
2. **Token seed se muestra una vez** - `plainToken` de integrations no recuperable después
3. **Endpoint health** necesita decorador `@Public()` (agregado en health.controller.ts)
4. **ValidationPipe** global con `whitelist: true`, `forbidNonWhitelisted: true`
5. **Prisma Decimal** - usar `.toNumber()` para respuestas, `new Decimal(value)` para escrituras
6. **Sin valores por defecto en DTOs de creación** (`campo?: T = x`) si existe un `UpdateDto extends PartialType(...)`: con `transform: true` el default se hereda y un PATCH sin ese campo lo sobrescribe. Aplicar el default en el servicio (`dto.campo ?? x`)
7. **Migraciones con renombres** - usar `npx prisma migrate dev --create-only` y editar el SQL a mano (`RENAME COLUMN`); Prisma por defecto hace DROP + ADD y pierde datos
8. **`prisma generate` falla con EPERM** en Windows si `start:dev` está corriendo (DLL del motor bloqueado): parar el servidor antes

## Credenciales Seed

Después de `npm run prisma:seed`:

- **Email**: `test@cushqui.local`
- **Password**: `Password123!`
- Rol **ADMIN** (puede crear invitaciones)
- Pre-cargados: 3 cuentas, las categorías base (12 de gasto + 5 de ingreso; Prestamos con Persona 1 y Persona 2), 4 transacciones

## Base de API

Todos los endpoints bajo `/api/v1/` - Swagger en `http://localhost:3000/docs`
