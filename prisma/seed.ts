import { PrismaClient, AccountType, MovementType, TransactionType, TransactionStatus, TransactionSource } from '@prisma/client';
import * as bcrypt from 'bcrypt';

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

  // Helper function for color lightening (same logic as in service)
function lightenColor(hex: string, percent: number = 20): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  const newR = Math.min(255, Math.round(r + (255 - r) * (percent / 100)));
  const newG = Math.min(255, Math.round(g + (255 - g) * (percent / 100)));
  const newB = Math.min(255, Math.round(b + (255 - b) * (percent / 100)));
  const toHex = (c: number) => c.toString(16).padStart(2, '0');
  return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
}

const categories = await Promise.all([
    prisma.category.upsert({
      where: { id: 'cat-food' },
      update: {},
      create: { id: 'cat-food', name: 'Alimentación', icon: '🍔', color: '#FF5733', type: TransactionType.EXPENSE, userId: null },
    }),
    prisma.category.upsert({
      where: { id: 'cat-transport' },
      update: {},
      create: { id: 'cat-transport', name: 'Transporte', icon: '🚌', color: '#33A1FF', type: TransactionType.EXPENSE, userId: null },
    }),
    prisma.category.upsert({
      where: { id: 'cat-leisure' },
      update: {},
      create: { id: 'cat-leisure', name: 'Ocio', icon: '🎮', color: '#8E44AD', type: TransactionType.EXPENSE, userId: null },
    }),
    prisma.category.upsert({
      where: { id: 'cat-home' },
      update: {},
      create: { id: 'cat-home', name: 'Casa', icon: '🏠', color: '#2ECC71', type: TransactionType.EXPENSE, userId: null },
    }),
    prisma.category.upsert({
      where: { id: 'cat-health' },
      update: {},
      create: { id: 'cat-health', name: 'Salud', icon: '💊', color: '#E74C3C', type: TransactionType.EXPENSE, userId: null },
    }),
    prisma.category.upsert({
      where: { id: 'cat-shopping' },
      update: {},
      create: { id: 'cat-shopping', name: 'Compras', icon: '🛍️', color: '#F39C12', type: TransactionType.EXPENSE, userId: null },
    }),
    prisma.category.upsert({
      where: { id: 'cat-travel' },
      update: {},
      create: { id: 'cat-travel', name: 'Viajes', icon: '✈️', color: '#1ABC9C', type: TransactionType.EXPENSE, userId: null },
    }),
    prisma.category.upsert({
      where: { id: 'cat-subscriptions' },
      update: {},
      create: { id: 'cat-subscriptions', name: 'Suscripciones', icon: '📱', color: '#9B59B6', type: TransactionType.EXPENSE, userId: null },
    }),
    prisma.category.upsert({
      where: { id: 'cat-other' },
      update: {},
      create: { id: 'cat-other', name: 'Otros', icon: '📦', color: '#95A5A6', type: TransactionType.EXPENSE, userId: null },
    }),
    // Prestamos category with subcategories
    prisma.category.upsert({
      where: { id: 'cat-loans' },
      update: {},
      create: { id: 'cat-loans', name: 'Préstamos', icon: '💰', color: '#FF6B35', type: TransactionType.EXPENSE, userId: null },
    }),
  ]);

  // Create subcategories for Prestamos
  const prestamosCategory = await prisma.category.findUnique({ where: { id: 'cat-loans' } });
  if (prestamosCategory) {
    await prisma.category.upsert({
      where: { id: 'cat-loans-jp' },
      update: {},
      create: {
        id: 'cat-loans-jp',
        name: 'Juan Pablo',
        icon: prestamosCategory.icon,
        color: lightenColor(prestamosCategory.color || '#FF6B35', 20),
        parentId: prestamosCategory.id,
        type: TransactionType.EXPENSE, userId: null,
      },
    });
    await prisma.category.upsert({
      where: { id: 'cat-loans-ana' },
      update: {},
      create: {
        id: 'cat-loans-ana',
        name: 'Ana',
        icon: prestamosCategory.icon,
        color: lightenColor(lightenColor(prestamosCategory.color || '#FF6B35', 20), 15),
        parentId: prestamosCategory.id,
        type: TransactionType.EXPENSE, userId: null,
      },
    });
  }

  console.log('✅ Categories created:', categories.map((c) => c.name).join(', '));

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