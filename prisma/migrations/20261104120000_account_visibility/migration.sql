-- AlterTable: existing accounts stay visible
ALTER TABLE "accounts" ADD COLUMN "visibleInList" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "balanceVisible" BOOLEAN NOT NULL DEFAULT true;
