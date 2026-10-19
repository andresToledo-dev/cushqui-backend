/**
 * Cleans the DEV database, keeping only one user and everything that belongs to them.
 *
 *   npm run db:clean:dev <email>            → dry run: shows what would be deleted
 *   npm run db:clean:dev:execute <email>    → deletes it (after saving a JSON backup)
 *
 * Deletes every other user (accounts, categories, transactions, movements, integrations and
 * import events go with them by cascade) and any category without a user (old global ones).
 * Refuses to run against production (DATABASE_URL containing PROD_DB_REF).
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const keepEmail = args.find((a) => !a.startsWith('--'));

function fail(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(1);
}

async function main() {
  if (!keepEmail) fail('Indica el email del usuario a conservar: npm run db:clean:dev <email>');

  const databaseUrl = process.env.DATABASE_URL ?? fail('DATABASE_URL no está definido en .env');
  const prodRef = process.env.PROD_DB_REF ?? fail('PROD_DB_REF no está definido en .env: sin él no se puede comprobar que la BD no es la de producción');
  if (databaseUrl.includes(prodRef)) fail(`DATABASE_URL apunta a producción (${prodRef}): este script solo limpia la BD dev`);

  const prisma = new PrismaClient();
  try {
    const keep = await prisma.user.findUnique({ where: { email: keepEmail } });
    if (!keep) fail(`El usuario ${keepEmail} no existe: no se borra nada`);

    const users = await prisma.user.findMany({
      where: { id: { not: keep.id } },
      select: {
        id: true,
        email: true,
        _count: { select: { accounts: true, categories: true, transactions: true, movements: true, integrations: true, importEvents: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const orphanCategories = await prisma.$queryRaw<{ id: string; name: string }[]>`SELECT "id", "name" FROM "categories" WHERE "userId" IS NULL`;

    console.log(`Se conserva: ${keepEmail}`);
    console.log(`Usuarios a borrar: ${users.length}`);
    for (const u of users) console.log(`   - ${u.email} ${JSON.stringify(u._count)}`);
    console.log(`Categorías sin usuario a borrar: ${orphanCategories.length}${orphanCategories.length ? ` (${orphanCategories.map((c) => c.name).join(', ')})` : ''}`);

    if (users.length === 0 && orphanCategories.length === 0) {
      console.log('✅ Nada que borrar');
      return;
    }
    if (!execute) {
      console.log('\nSimulación: no se ha borrado nada. Para borrar: npm run db:clean:dev:execute <email>');
      return;
    }

    // Backup of every row that is about to disappear (scripts/imports/ is git-ignored)
    const userIds = users.map((u) => u.id);
    const byUser = { userId: { in: userIds } };
    const backup = {
      createdAt: new Date().toISOString(),
      kept: keepEmail,
      users: await prisma.user.findMany({ where: { id: { in: userIds } } }),
      accounts: await prisma.account.findMany({ where: byUser }),
      categories: await prisma.category.findMany({ where: byUser }),
      orphanCategories: await prisma.$queryRaw`SELECT * FROM "categories" WHERE "userId" IS NULL`,
      transactions: await prisma.transaction.findMany({ where: byUser }),
      movements: await prisma.accountMovement.findMany({ where: byUser }),
      integrations: await prisma.integration.findMany({ where: byUser }),
      importEvents: await prisma.importEvent.findMany({ where: byUser }),
    };
    const backupDir = path.join(__dirname, 'imports');
    fs.mkdirSync(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, `db-clean-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
    console.log(`\nCopia de seguridad: ${backupFile}`);

    const [orphans, deletedUsers] = await prisma.$transaction([
      prisma.$executeRaw`DELETE FROM "categories" WHERE "userId" IS NULL`,
      // Cascade: accounts, categories, transactions, movements, integrations and import events
      prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    ]);
    console.log(`✅ Borrados: ${deletedUsers.count} usuarios y ${orphans} categorías sin usuario`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
