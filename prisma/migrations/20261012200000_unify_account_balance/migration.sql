-- Unify initialBalance + currentBalance into a single balance column (preserves current balances)
ALTER TABLE "accounts" RENAME COLUMN "currentBalance" TO "balance";

-- AlterTable
ALTER TABLE "accounts" DROP COLUMN "initialBalance";
