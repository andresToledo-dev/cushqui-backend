# Cushqui Backend

Personal finance management backend built with NestJS, TypeScript, Prisma, and PostgreSQL.

## Features

- User authentication with JWT (access + refresh tokens)
- Financial accounts management (bank, cash, card, wallet, savings)
- Categories and subcategories (global + user custom)
- Transactions (expenses, income, transfers)
- Transaction classification (unclassified → classified)
- Automatic import from iOS Shortcuts with deduplication
- Dashboard with balance and monthly stats
- Statistics by category, account, and month
- Transfers between accounts
- Integrations management (NOTIFICATION and MANUAL tokens)
- Full test coverage (unit + e2e)

## Requirements

- Node.js 20+
- Docker & Docker Compose
- npm 9+

## Installation

```bash
npm install
```

## Database Setup

Start PostgreSQL with Docker Compose:

```bash
docker compose up -d
```

Verify the database is running:

```bash
docker compose ps
```

## Environment Variables

Copy the example file and adjust if needed:

```bash
cp .env.example .env
```

Default configuration:

```env
DATABASE_URL="postgresql://cushqui:cushqui@localhost:5432/cushqui?schema=public"
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_REFRESH_SECRET="your-super-secret-refresh-key-change-in-production"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
PORT=3000
NODE_ENV=development
API_PREFIX=api/v1
```

## Prisma Setup

Generate Prisma client:

```bash
npm run prisma:generate
```

Run migrations:

```bash
npm run prisma:migrate
```

Seed the database with test data:

```bash
npm run prisma:seed
```

## Running the Application

Development mode with hot reload:

```bash
npm run start:dev
```

Production build:

```bash
npm run build
npm run start:prod
```

The API will be available at:
- **API**: http://localhost:3000/api/v1
- **Swagger Docs**: http://localhost:3000/docs
- **Health Check**: http://localhost:3000/api/v1/health

## Testing

Run unit tests:

```bash
npm test
```

Run e2e tests:

```bash
npm run test:e2e
```

Run tests with coverage:

```bash
npm run test:cov
```

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Register new user |
| POST | `/api/v1/auth/login` | Login user |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| POST | `/api/v1/auth/logout` | Logout user |
| GET | `/api/v1/auth/me` | Get current user |

### Accounts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/accounts` | List all accounts |
| POST | `/api/v1/accounts` | Create account |
| GET | `/api/v1/accounts/:id` | Get account by ID |
| PATCH | `/api/v1/accounts/:id` | Update account |
| DELETE | `/api/v1/accounts/:id` | Delete account |
| GET | `/api/v1/accounts/:id/balance` | Get account balance |

### Categories

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/categories` | List categories (global + user) |
| POST | `/api/v1/categories` | Create category |
| GET | `/api/v1/categories/:id` | Get category by ID |
| PATCH | `/api/v1/categories/:id` | Update category |
| DELETE | `/api/v1/categories/:id` | Delete category |

### Transactions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/transactions` | List transactions (with filters) |
| POST | `/api/v1/transactions` | Create transaction |
| GET | `/api/v1/transactions/:id` | Get transaction by ID |
| PATCH | `/api/v1/transactions/:id` | Update transaction |
| DELETE | `/api/v1/transactions/:id` | Delete transaction |
| POST | `/api/v1/transactions/:id/classify` | Classify transaction |

**Transaction Filters:**
- `accountId` - Filter by account
- `categoryId` - Filter by category
- `status` - `UNCLASSIFIED` or `CLASSIFIED`
- `type` - `EXPENSE`, `INCOME`, `TRANSFER`
- `source` - `MANUAL`, `APPLE_PAY`, `MBWAY`, `REVOLUT`, `BANK`, `OTHER`
- `from` - Start date (ISO 8601)
- `to` - End date (ISO 8601)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20, max: 100)

### Imports (bank notifications)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/imports/notification` | Import transaction from a bank notification message |

**Authentication:** Uses `Authorization: Bearer <NOTIFICATION_TOKEN>` (not JWT)

### Dashboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/dashboard` | Get dashboard summary |

### Statistics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/statistics/categories` | Expenses by category |
| GET | `/api/v1/statistics/accounts` | Stats by account |
| GET | `/api/v1/statistics/monthly` | Monthly stats (last 12 months) |

**Query params:** `from`, `to` (ISO 8601 dates)

### Transfers

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/transfers` | Create transfer between accounts |

### Integrations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/integrations` | List integrations |
| POST | `/api/v1/integrations` | Create integration |
| GET | `/api/v1/integrations/:id` | Get integration |
| PATCH | `/api/v1/integrations/:id` | Update integration |
| DELETE | `/api/v1/integrations/:id` | Delete integration |
| POST | `/api/v1/integrations/:id/regenerate-token` | Regenerate token |

## Testing the Notification Import

### 1. Create an Integration (get token)

```bash
curl -X POST http://localhost:3000/api/v1/integrations \
  -H "Authorization: Bearer <YOUR_JWT_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "iPhone Shortcut",
    "type": "NOTIFICATION",
    "accountId": "revolut-account"
  }'
```

Response includes `plainToken` (shown only once - save it!).

### 2. Import a transaction using the token

```bash
curl -X POST http://localhost:3000/api/v1/imports/notification \
  -H "Authorization: Bearer <NOTIFICATION_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "REVOLUT",
    "amount": 15.90,
    "currency": "EUR",
    "merchant": "Pingo Doce",
    "transactionDate": "2026-10-02T12:00:00Z"
  }'
```

Response:
```json
{
  "success": true,
  "created": true,
  "transactionId": "uuid-of-transaction"
}
```

### 3. Verify it appears as unclassified

```bash
curl -X GET "http://localhost:3000/api/v1/transactions?status=UNCLASSIFIED" \
  -H "Authorization: Bearer <YOUR_JWT_ACCESS_TOKEN>"
```

### 4. Test deduplication (send same request again)

```bash
curl -X POST http://localhost:3000/api/v1/imports/notification \
  -H "Authorization: Bearer <NOTIFICATION_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "REVOLUT",
    "amount": 15.90,
    "currency": "EUR",
    "merchant": "Pingo Doce",
    "transactionDate": "2026-10-02T12:00:00Z"
  }'
```

Response:
```json
{
  "success": true,
  "created": false,
  "duplicate": true,
  "transactionId": "uuid-of-existing-transaction"
}
```

## Seed Credentials

After running `npm run prisma:seed`:

- **Email**: `test@cushqui.local`
- **Password**: `Password123!`

Pre-created data:
- 3 accounts: Revolut (€1000), ActivoBank (€500), Efectivo (€50)
- 9 global categories
- 4 sample transactions (classified expense, unclassified expense, income, cash expense)

## Project Structure

```
src/
├── auth/              # Authentication (JWT, register, login)
├── users/             # User profile
├── accounts/          # Financial accounts
├── categories/        # Categories & subcategories
├── transactions/      # Transactions CRUD + classification
├── imports/           # Notification and manual imports with deduplication
├── integrations/      # Integration tokens management
├── dashboard/         # Dashboard summary
├── statistics/        # Statistics (categories, accounts, monthly)
├── transfers/         # Transfers between accounts
├── health/            # Health check
├── prisma/            # Prisma service & module
├── common/            # Shared decorators, guards, filters
└── main.ts            # Application entry point
```

## Tech Stack

- **Framework**: NestJS 10
- **Language**: TypeScript 5
- **Database**: PostgreSQL 15
- **ORM**: Prisma 5
- **Auth**: JWT + Passport + bcrypt
- **Validation**: class-validator + class-transformer
- **Testing**: Jest + Supertest
- **Docs**: Swagger/OpenAPI

## Database Schema

Key models:
- **User** - Authentication & ownership
- **Account** - Financial accounts (bank, cash, card, etc.)
- **Category** - Global + user categories
- **Subcategory** - Subcategories under categories
- **Transaction** - Core entity (expense, income, transfer)
- **Integration** - External integrations (NOTIFICATION, MANUAL)
- **ImportEvent** - Deduplication tracking for imports

## License

MIT