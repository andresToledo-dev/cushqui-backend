// Jest e2e setup file - runs before all tests
// Loads .env (local development database) and refuses to run against production
require("dotenv").config({ path: ".env" });

// Only set non-secret defaults if not already set by .env
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-testing-only";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-refresh-secret-for-testing-only";
process.env.API_PREFIX = process.env.API_PREFIX || "api/v1";
process.env.PORT = process.env.PORT || "3000";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Configure .env with the development database before running e2e tests.");
}

// e2e tests create and modify data: never run them against the production database
// (dev and prod share the Supabase pooler host; the project-ref in the URL tells them apart)
const prodDbRef = process.env.PROD_DB_REF;
if (prodDbRef && process.env.DATABASE_URL.includes(prodDbRef)) {
  throw new Error(`Refusing to run e2e tests: DATABASE_URL points to the production database (${prodDbRef}).`);
}
