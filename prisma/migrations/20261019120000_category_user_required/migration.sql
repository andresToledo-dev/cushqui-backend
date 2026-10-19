-- Categories always belong to a user: there are no global categories any more.
-- New users get the default categories at registration (src/categories/default-categories.ts).
-- Abort instead of deleting data: global categories must be removed (or assigned) by hand first.
DO $$
DECLARE
  global_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO global_count FROM "categories" WHERE "userId" IS NULL;
  IF global_count > 0 THEN
    RAISE EXCEPTION 'There are % categories without userId: remove or assign them before making userId required', global_count;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "categories" ALTER COLUMN "userId" SET NOT NULL;
