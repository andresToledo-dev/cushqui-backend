import { PrismaClient, AccountType, MovementType, TransactionType, TransactionStatus, TransactionSource } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createDefaultCategories } from '../src/categories/default-categories';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  const passwordHash = await bcrypt.hash('Password123!', 12);

  const user = await prisma.user.upsert({
    where: { email: 'test@cushqui.local' },
    update: {},
    create: {
      email: 'test@cushqui.local',
      passwordHash,
      name: 'Test User',
    },
  });

  console.log('✅ User created:', user.email);

  const accounts = await Promise.all([
    prisma.account.upsert({
      where: { id: 'revolut-account' },
      update: {},
      create: {
        id: 'revolut-account',
        userId: user.id,
        name: 'Revolut',
        type: AccountType.BANK,
        currency: 'EUR',
        balance: 1000,
        isActive: true,
      },
    }),
    prisma.account.upsert({
      where: { id: 'activobank-account' },
      update: {},
      create: {
        id: 'activobank-account',
        userId: user.id,
        name: 'ActivoBank',
        type: AccountType.BANK,
        currency: 'EUR',
        balance: 500,
        isActive: true,
      },
    }),
    prisma.account.upsert({
      where: { id: 'cash-account' },
      update: {},
      create: {
        id: 'cash-account',
        userId: user.id,
        name: 'Efectivo',
        type: AccountType.CASH,
        currency: 'EUR',
        balance: 50,
        isActive: true,
      },
    }),
  ]);

  console.log('✅ Accounts created:', accounts.map((a) => a.name).join(', '));

  // Every account history starts with its OPENING movement (the migration may have backfilled it already)
  for (const account of accounts) {
    const opening = await prisma.accountMovement.findFirst({
      where: { accountId: account.id, type: MovementType.OPENING },
    });

    if (!opening) {
      await prisma.accountMovement.create({
        data: {
          userId: user.id,
          type: MovementType.OPENING,
          accountId: account.id,
          amount: account.balance,
          currency: account.currency,
          movementDate: account.createdAt,
        },
      });
    }
  }

  console.log('✅ Opening movements created');

  // Default categories owned by the seed user, the same ones every user gets at registration
  if ((await prisma.category.count({ where: { userId: user.id } })) === 0) {
    await prisma.$transaction((tx) => createDefaultCategories(tx, user.id));
  }
  const findCategory = async (name: string) =>
    prisma.category.findFirstOrThrow({ where: { userId: user.id, name, type: TransactionType.EXPENSE, parentId: null } });
  const categories = [await findCategory('Alimentación'), await findCategory('Transporte')];

  console.log('✅ Default categories ready for', user.email);

  const now = new Date();
  const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
  const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

  const transactions = await Promise.all([
    prisma.transaction.upsert({
      where: { id: 'tx-classified' },
      update: {},
      create: {
        id: 'tx-classified',
        userId: user.id,
        accountId: accounts[0].id,
        categoryId: categories[0].id,
        amount: 25.5,
        currency: 'EUR',
        type: TransactionType.EXPENSE,
        status: TransactionStatus.CLASSIFIED,
        source: TransactionSource.MANUAL,
        merchant: 'Continente',
        description: 'Compra semanal',
        transactionDate: tenDaysAgo,
      },
    }),
    prisma.transaction.upsert({
      where: { id: 'tx-unclassified' },
      update: {},
      create: {
        id: 'tx-unclassified',
        userId: user.id,
        accountId: accounts[1].id,
        categoryId: null,
        amount: 15.9,
        currency: 'EUR',
        type: TransactionType.EXPENSE,
        status: TransactionStatus.UNCLASSIFIED,
        source: TransactionSource.REVOLUT,
        merchant: 'Uber',
        description: 'Viaje al centro',
        transactionDate: fiveDaysAgo,
      },
    }),
    prisma.transaction.upsert({
      where: { id: 'tx-income' },
      update: {},
      create: {
        id: 'tx-income',
        userId: user.id,
        accountId: accounts[0].id,
        categoryId: null,
        amount: 1500,
        currency: 'EUR',
        type: TransactionType.INCOME,
        status: TransactionStatus.CLASSIFIED,
        source: TransactionSource.MANUAL,
        merchant: 'Empresa SL',
        description: 'Nómina octubre',
        transactionDate: twoDaysAgo,
      },
    }),
    prisma.transaction.upsert({
      where: { id: 'tx-cash' },
      update: {},
      create: {
        id: 'tx-cash',
        userId: user.id,
        accountId: accounts[2].id,
        categoryId: categories[1].id,
        amount: 5.5,
        currency: 'EUR',
        type: TransactionType.EXPENSE,
        status: TransactionStatus.CLASSIFIED,
        source: TransactionSource.MANUAL,
        merchant: 'Metro',
        description: 'Billete sencillo',
        transactionDate: yesterday,
      },
    }),
  ]);

  console.log('✅ Transactions created:', transactions.length);

  console.log('🎉 Seed completed successfully!');
  console.log('');
  console.log('📧 Test user: test@cushqui.local');
  console.log('🔑 Password: Password123!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });