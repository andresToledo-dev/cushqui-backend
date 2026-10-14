-- Categories get a type (EXPENSE / INCOME). Existing data is backfilled from the transactions
-- that use each category. Everything runs in one transaction: any failure leaves the DB untouched.
BEGIN;

-- 1. Nullable first, so existing rows can be backfilled
ALTER TABLE "categories" ADD COLUMN "type" "TransactionType";

-- 2. Split top-level categories used by both INCOME and EXPENSE transactions:
--    the original becomes EXPENSE; a copy (same user, name, icon, color) becomes INCOME and
--    receives the INCOME transactions. Subcategories used by those INCOME transactions are
--    copied under the new INCOME parent too.
DO $$
DECLARE
  cat RECORD;
  sub RECORD;
  income_id TEXT;
  income_sub_id TEXT;
BEGIN
  FOR cat IN
    SELECT c.* FROM "categories" c
    WHERE c."parentId" IS NULL
      AND EXISTS (SELECT 1 FROM "transactions" t WHERE t."categoryId" = c."id" AND t."type" = 'INCOME')
      AND EXISTS (SELECT 1 FROM "transactions" t WHERE t."categoryId" = c."id" AND t."type" = 'EXPENSE')
  LOOP
    income_id := gen_random_uuid()::text;
    INSERT INTO "categories" ("id", "userId", "name", "type", "icon", "color", "parentId", "createdAt", "updatedAt")
    VALUES (income_id, cat."userId", cat."name", 'INCOME', cat."icon", cat."color", NULL, cat."createdAt", CURRENT_TIMESTAMP);
    UPDATE "categories" SET "type" = 'EXPENSE' WHERE "id" = cat."id";

    FOR sub IN
      SELECT DISTINCT s."id", s."userId", s."name", s."icon", s."color", s."createdAt"
      FROM "categories" s
      JOIN "transactions" t ON t."subcategoryId" = s."id"
      WHERE s."parentId" = cat."id" AND t."categoryId" = cat."id" AND t."type" = 'INCOME'
    LOOP
      income_sub_id := gen_random_uuid()::text;
      INSERT INTO "categories" ("id", "userId", "name", "type", "icon", "color", "parentId", "createdAt", "updatedAt")
      VALUES (income_sub_id, sub."userId", sub."name", 'INCOME', sub."icon", sub."color", income_id, sub."createdAt", CURRENT_TIMESTAMP);
      UPDATE "transactions" SET "subcategoryId" = income_sub_id
      WHERE "subcategoryId" = sub."id" AND "categoryId" = cat."id" AND "type" = 'INCOME';
    END LOOP;

    UPDATE "transactions" SET "categoryId" = income_id WHERE "categoryId" = cat."id" AND "type" = 'INCOME';
  END LOOP;
END $$;

-- 3. Remaining top-level categories: INCOME if only used by income, otherwise EXPENSE (unused included)
UPDATE "categories" c SET "type" = 'INCOME'
WHERE c."type" IS NULL AND c."parentId" IS NULL
  AND EXISTS (SELECT 1 FROM "transactions" t WHERE t."categoryId" = c."id" AND t."type" = 'INCOME');

UPDATE "categories" SET "type" = 'EXPENSE' WHERE "type" IS NULL AND "parentId" IS NULL;

--    Subcategories always take the type of their parent
UPDATE "categories" s SET "type" = p."type"
FROM "categories" p
WHERE s."parentId" = p."id" AND s."type" IS NULL;

-- 4. Safety net: abort everything if any transaction ended up with a category of another type
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "transactions" t JOIN "categories" c ON c."id" = t."categoryId" WHERE c."type" <> t."type")
     OR EXISTS (SELECT 1 FROM "transactions" t JOIN "categories" s ON s."id" = t."subcategoryId" WHERE s."type" <> t."type")
     OR EXISTS (SELECT 1 FROM "categories" WHERE "type" IS NULL) THEN
    RAISE EXCEPTION 'category type backfill left inconsistent data; migration aborted';
  END IF;
END $$;

-- 5. Required from now on
ALTER TABLE "categories" ALTER COLUMN "type" SET NOT NULL;

COMMIT;
