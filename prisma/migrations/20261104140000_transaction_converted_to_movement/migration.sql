-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "convertedToMovementId" TEXT;

-- CreateIndex
CREATE INDEX "transactions_convertedToMovementId_idx" ON "transactions"("convertedToMovementId");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_convertedToMovementId_fkey" FOREIGN KEY ("convertedToMovementId") REFERENCES "account_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
