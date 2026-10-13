#!/usr/bin/env node
/**
 * Manual production deploy (fallback for .github/workflows/deploy-prod.yml).
 *
 *   npm run deploy:prod      → checks → unit tests → migrations on prod DB → vercel deploy --prod
 *   npm run db:deploy:prod   → checks → migrations on prod DB only
 *
 * Production variables are read from .env.production (git-ignored), never from .env (dev).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.production');
const REQUIRED_VARS = ['DATABASE_URL', 'DIRECT_URL'];
const migrateOnly = process.argv.includes('--migrate-only');

function fail(message) {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

function run(command, args, { capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: process.env,
  });
  if (result.status !== 0) {
    fail(`Command failed: ${command} ${args.join(' ')}${capture ? `\n${result.stderr}` : ''}`);
  }
  return capture ? result.stdout.trim() : '';
}

function step(title) {
  console.log(`\n▶ ${title}`);
}

// 1. Git checks: only deploy what is on origin/main
step('Checking git state');
const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { capture: true });
if (branch !== 'main') fail(`You are on "${branch}". Production deploys only from "main".`);

if (run('git', ['status', '--porcelain'], { capture: true })) {
  fail('There are uncommitted changes. Commit or stash them first.');
}

run('git', ['fetch', 'origin', 'main', '--quiet']);
const local = run('git', ['rev-parse', 'HEAD'], { capture: true });
const remote = run('git', ['rev-parse', 'origin/main'], { capture: true });
if (local !== remote) fail('Local "main" is not in sync with origin/main. Run git pull / git push first.');

// 2. Production environment
step('Loading .env.production');
if (!fs.existsSync(ENV_FILE)) fail('.env.production not found. Copy .env.example and fill it with the production values.');
for (const name of REQUIRED_VARS) delete process.env[name]; // never inherit dev values
process.loadEnvFile(ENV_FILE);
const missing = REQUIRED_VARS.filter((name) => !process.env[name]);
if (missing.length) fail(`Missing in .env.production: ${missing.join(', ')}`);

try {
  console.log(`  Production database host: ${new URL(process.env.DATABASE_URL).hostname}`);
} catch {
  fail('DATABASE_URL in .env.production is not a valid URL (URL-encode special characters in the password).');
}

// 3. Tests (unit tests do not touch any database)
step('Running unit tests');
run('npm', ['test', '--', '--silent']);

// 4. Migrations: always before the new code goes live
step('Applying migrations to the production database');
run('npx', ['prisma', 'migrate', 'deploy']);

if (migrateOnly) {
  console.log('\n✅ Production database is up to date.');
  process.exit(0);
}

// 5. Deploy to Vercel (builds remotely with the Production environment variables)
step('Deploying to Vercel (production)');
run('npx', ['vercel', 'deploy', '--prod']);

console.log('\n✅ Production deploy finished.');
