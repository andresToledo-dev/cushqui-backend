-- 1. New movements table -----------------------------------------------------

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('OPENING', 'ADJUSTMENT', 'TRANSFER');

-- CreateTable
CREATE TABLE "account_movements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "accountId" TEXT NOT NULL,
    "toAccountId" TEXT,
    "amount" DECIMAL(19,4) NOT NULL,
    "balanceBefore" DECIMAL(19,4),
    "balanceAfter" DECIMAL(19,4),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "note" TEXT,
    "movementDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_movements_userId_idx" ON "account_movements"("userId");

-- CreateIndex
CREATE INDEX "account_movements_accountId_idx" ON "account_movements"("accountId");

-- CreateIndex
CREATE INDEX "account_movements_toAccountId_idx" ON "account_movements"("toAccountId");

-- CreateIndex
CREATE INDEX "account_movements_movementDate_idx" ON "account_movements"("movementDate");

-- AddForeignKey
ALTER TABLE "account_movements" ADD CONSTRAINT "account_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_movements" ADD CONSTRAINT "account_movements_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_movements" ADD CONSTRAINT "account_movements_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Move existing transfers out of transactions -----------------------------

INSERT INTO "account_movements" ("id", "userId", "type", "accountId", "toAccountId", "amount", "currency", "note", "movementDate", "createdAt", "updatedAt")
SELECT "id", "userId", 'TRANSFER', "accountId", "toAccountId", "amount", "currency", "description", "transactionDate", "createdAt", "updatedAt"
FROM "transactions"
WHERE "type" = 'TRANSFER' AND "deletedAt" IS NULL AND "toAccountId" IS NOT NULL;

DELETE FROM "transactions" WHERE "type" = 'TRANSFER';

-- 3. Backfill one OPENING per existing account -------------------------------
-- initialBalance no longer exists, so the opening amount is APPROXIMATED as:
--   balance - (income - expense) + transfers out - transfers in
-- Any untracked manual balance edit made before this migration ends up inside the opening.

INSERT INTO "account_movements" ("id", "userId", "type", "accountId", "amount", "currency", "note", "movementDate", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    a."userId",
    'OPENING',
    a."id",
    a."balance"
      - COALESCE((SELECT SUM(CASE WHEN t."type" = 'INCOME' THEN t."amount" ELSE -t."amount" END)
                  FROM "transactions" t
                  WHERE t."accountId" = a."id" AND t."deletedAt" IS NULL), 0)
      + COALESCE((SELECT SUM(m."amount") FROM "account_movements" m
                  WHERE m."type" = 'TRANSFER' AND m."accountId" = a."id"), 0)
      - COALESCE((SELECT SUM(m."amount") FROM "account_movements" m
                  WHERE m."type" = 'TRANSFER' AND m."toAccountId" = a."id"), 0),
    a."currency",
    'Backfilled by migration (approximate)',
    a."createdAt",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "accounts" a;

-- 4. Transactions only hold INCOME / EXPENSE ---------------------------------

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_toAccountId_fkey";

-- DropIndex
DROP INDEX "transactions_toAccountId_idx";

-- AlterTable
ALTER TABLE "transactions" DROP COLUMN "toAccountId";

-- AlterEnum
CREATE TYPE "TransactionType_new" AS ENUM ('EXPENSE', 'INCOME');
ALTER TABLE "transactions" ALTER COLUMN "type" TYPE "TransactionType_new" USING ("type"::text::"TransactionType_new");
ALTER TYPE "TransactionType" RENAME TO "TransactionType_old";
ALTER TYPE "TransactionType_new" RENAME TO "TransactionType";
DROP TYPE "TransactionType_old";
