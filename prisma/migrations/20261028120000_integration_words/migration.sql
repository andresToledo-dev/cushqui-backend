-- Words that classify a notification as expense / income, chosen per integration (NOTIFICATION only).
ALTER TABLE "integrations" ADD COLUMN "expenseWords" TEXT,
ADD COLUMN "incomeWords" TEXT;

-- Existing NOTIFICATION integrations keep the words that used to be hardcoded in parseMessage
UPDATE "integrations" SET "expenseWords" = 'has enviado,has gastado', "incomeWords" = 'has recibido,te ha enviado dinero' WHERE "type" = 'NOTIFICATION';
