-- Tokens are now stored as SHA256 (was bcrypt) and looked up by a unique index instead of
-- comparing against every active integration. Existing bcrypt hashes no longer match any token:
-- those integrations need POST /integrations/:id/regenerate-token.
DROP INDEX "integrations_tokenHash_idx";

CREATE UNIQUE INDEX "integrations_tokenHash_key" ON "integrations"("tokenHash");
