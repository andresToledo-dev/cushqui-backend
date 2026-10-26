/**
 * Invitation codes and admins from the command line (bootstrap: without an ADMIN nobody can create invitations).
 *
 *   npm run invite:dev [email]            → USER invitation in the dev DB, prints the code
 *   npm run invite:admin:dev [email]      → ADMIN invitation in the dev DB
 *   npm run invite:admin:prod [email]     → ADMIN invitation in the PROD DB (.env.production)
 *   npm run user:admin:dev <email>        → makes an existing dev user ADMIN
 *   npm run user:admin:prod <email>       → makes an existing prod user ADMIN
 *
 * With an email the code only works for that email. Codes expire in 7 days.
 * Without --prod it refuses to run if DATABASE_URL contains PROD_DB_REF; with --prod it requires it.
 */
import { PrismaClient, UserRole } from '@prisma/client';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { generateInvitationCode, hashInvitationCode, invitationExpiry } from '../src/invitations/invitation-code.util';

const args = process.argv.slice(2);
const PROD = args.includes('--prod');
const command = args.find((a) => !a.startsWith('--'));
const email = args.filter((a) => !a.startsWith('--'))[1]?.trim().toLowerCase();

dotenv.config({ path: path.join(__dirname, '..', PROD ? '.env.production' : '.env'), override: true });

function fail(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function checkTarget() {
  const envFile = PROD ? '.env.production' : '.env';
  const databaseUrl = process.env.DATABASE_URL ?? fail(`DATABASE_URL no está definido en ${envFile}`);
  const prodRef = process.env.PROD_DB_REF ?? fail(`PROD_DB_REF no está definido en ${envFile}: sin él no se puede comprobar a qué BD se conecta`);
  const isProd = databaseUrl.includes(prodRef);
  if (PROD && !isProd) fail(`--prod pero DATABASE_URL de ${envFile} no apunta a producción (${prodRef})`);
  if (!PROD && isProd) fail(`DATABASE_URL de ${envFile} apunta a producción (${prodRef}): usa los comandos :prod`);
}

async function createInvitation(prisma: PrismaClient, role: UserRole) {
  if (email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) fail(`El usuario ${email} ya existe${role === UserRole.ADMIN ? `: usa user:admin${PROD ? ':prod' : ':dev'} ${email}` : ''}`);
  }

  const code = generateInvitationCode();
  const invitation = await prisma.invitation.create({
    data: { codeHash: hashInvitationCode(code), email, role, expiresAt: invitationExpiry() },
  });

  console.log(`✅ Invitación ${role} creada en ${PROD ? 'PRODUCCIÓN' : 'dev'}${email ? ` para ${email}` : ' (cualquier email)'}`);
  console.log(`   Código: ${code}   (no se puede recuperar: guárdalo ahora)`);
  console.log(`   Caduca: ${invitation.expiresAt.toISOString()}`);
}

async function makeAdmin(prisma: PrismaClient) {
  if (!email) fail('Indica el email del usuario: npm run user:admin:dev <email>');
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) fail(`El usuario ${email} no existe`);
  if (user.role === UserRole.ADMIN) {
    console.log(`✅ ${email} ya es ADMIN`);
    return;
  }
  await prisma.user.update({ where: { id: user.id }, data: { role: UserRole.ADMIN } });
  console.log(`✅ ${email} ahora es ADMIN en ${PROD ? 'PRODUCCIÓN' : 'dev'}`);
}

async function main() {
  if (!['invite', 'invite-admin', 'make-admin'].includes(command ?? '')) {
    fail('Uso: npm run invite:dev [email] | invite:admin:dev [email] | invite:admin:prod [email] | user:admin:dev <email> | user:admin:prod <email>');
  }
  checkTarget();

  // Explicit URL: the Prisma client may have loaded .env on import, before .env.production
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  try {
    if (command === 'make-admin') await makeAdmin(prisma);
    else await createInvitation(prisma, command === 'invite-admin' ? UserRole.ADMIN : UserRole.USER);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
