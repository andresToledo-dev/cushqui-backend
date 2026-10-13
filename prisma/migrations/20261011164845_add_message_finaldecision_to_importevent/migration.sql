/*
  Warnings:

  - Added the required column `finalDecision` to the `import_events` table without a default value. This is not possible if the table is not empty.
  - Added the required column `message` to the `import_events` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "FinalDecision" AS ENUM ('EXPENSE', 'INCOME', 'NA');

-- AlterTable
ALTER TABLE "import_events" ADD COLUMN     "finalDecision" "FinalDecision" NOT NULL,
ADD COLUMN     "message" TEXT NOT NULL;
