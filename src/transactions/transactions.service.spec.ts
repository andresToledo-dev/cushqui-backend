import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { ClassifyTransactionDto } from './dto/classify-transaction.dto';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { TransactionType, TransactionStatus, TransactionSource } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: PrismaService;

  const mockTx = {
    transaction: {
      create: jest.fn(),
      update: jest.fn(),
    },
    account: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockPrisma = {
    transaction: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    account: {
      findUnique: jest.fn(),
    },
    category: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockTx)),
  };

  const userId = 'user-id';
  const accountId = 'account-id';
  const categoryId = 'category-id';
  const transactionId = 'transaction-id';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  const expectBalanceIncrement = (id: string, delta: number) =>
    expect(mockTx.account.update).toHaveBeenCalledWith({
      where: { id },
      data: { balance: { increment: new Decimal(delta) } },
    });

  const buildFullTransaction = (overrides: Record<string, unknown> = {}) => ({
    id: transactionId,
    userId,
    accountId,
    categoryId: null,
    subcategoryId: null,
    amount: new Decimal(10),
    currency: 'EUR',
    type: TransactionType.INCOME,
    status: TransactionStatus.UNCLASSIFIED,
    source: TransactionSource.MANUAL,
    merchant: null,
    description: null,
    externalId: null,
    transactionDate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    account: { id: accountId, name: 'Revolut' },
    category: null,
    subcategory: null,
    ...overrides,
  });

  describe('create', () => {
    it('should create a classified transaction with category', async () => {
      const dto: CreateTransactionDto = {
        accountId,
        amount: 25.5,
        currency: 'EUR',
        type: TransactionType.EXPENSE,
        merchant: 'Continente',
        categoryId,
        transactionDate: '2026-10-02T12:00:00Z',
      };

      const account = { id: accountId, userId, name: 'Revolut', balance: new Decimal(1000) };
      const category = { id: categoryId, userId, name: 'Food' };
      const created = {
        id: transactionId,
        userId,
        accountId,
        categoryId,
        amount: new Decimal(dto.amount),
        currency: dto.currency,
        type: dto.type,
        status: TransactionStatus.CLASSIFIED,
        source: TransactionSource.MANUAL,
        merchant: dto.merchant,
        description: dto.description,
        transactionDate: new Date(dto.transactionDate),
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        account,
        category,
        subcategory: null,
      };

      mockPrisma.account.findUnique.mockResolvedValue(account);
      mockPrisma.category.findUnique.mockResolvedValue(category);
      mockTx.transaction.create.mockResolvedValue(created);
      mockTx.account.update.mockResolvedValue({});

      const result = await service.create(userId, dto);

      expect(result.status).toBe(TransactionStatus.CLASSIFIED);
      expect(result.categoryId).toBe(categoryId);
      expectBalanceIncrement(accountId, -25.5);
    });

    it('should increase the balance for an INCOME transaction', async () => {
      const dto: CreateTransactionDto = {
        accountId,
        amount: 10,
        type: TransactionType.INCOME,
        transactionDate: '2026-10-02T12:00:00Z',
      };

      mockPrisma.account.findUnique.mockResolvedValue({ id: accountId, userId, balance: new Decimal(1000) });
      mockTx.transaction.create.mockResolvedValue(buildFullTransaction());

      await service.create(userId, dto);

      expectBalanceIncrement(accountId, 10);
    });

    it('should create an unclassified transaction without category', async () => {
      const dto: CreateTransactionDto = {
        accountId,
        amount: 25.5,
        currency: 'EUR',
        type: TransactionType.EXPENSE,
        merchant: 'Continente',
        transactionDate: '2026-10-02T12:00:00Z',
      };

      const account = { id: accountId, userId, name: 'Revolut', balance: new Decimal(1000) };
      const created = {
        id: transactionId,
        userId,
        accountId,
        categoryId: null,
        amount: new Decimal(dto.amount),
        currency: dto.currency,
        type: dto.type,
        status: TransactionStatus.UNCLASSIFIED,
        source: TransactionSource.MANUAL,
        merchant: dto.merchant,
        description: dto.description,
        transactionDate: new Date(dto.transactionDate),
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        account,
        category: null,
        subcategory: null,
      };

      mockPrisma.account.findUnique.mockResolvedValue(account);
      mockTx.transaction.create.mockResolvedValue(created);
      mockTx.account.update.mockResolvedValue({});

      const result = await service.create(userId, dto);

      expect(result.status).toBe(TransactionStatus.UNCLASSIFIED);
      expect(result.categoryId).toBeUndefined();
    });
  });

  describe('update', () => {
    const existing = { id: transactionId, userId, accountId, categoryId: null, status: TransactionStatus.UNCLASSIFIED, amount: new Decimal(10), type: TransactionType.INCOME, deletedAt: null };

    it('should revert the old amount and apply the new one', async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue(existing);
      mockTx.transaction.update.mockResolvedValue(buildFullTransaction({ amount: new Decimal(5) }));

      await service.update(userId, transactionId, { amount: 5 });

      expect(mockTx.account.update).toHaveBeenCalledTimes(2);
      expectBalanceIncrement(accountId, -10);
      expectBalanceIncrement(accountId, 5);
    });

    it('should handle a type change from INCOME to EXPENSE', async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue(existing);
      mockTx.transaction.update.mockResolvedValue(buildFullTransaction({ type: TransactionType.EXPENSE }));

      await service.update(userId, transactionId, { type: TransactionType.EXPENSE });

      expectBalanceIncrement(accountId, -10);
      expect(mockTx.account.update).toHaveBeenNthCalledWith(2, {
        where: { id: accountId },
        data: { balance: { increment: new Decimal(-10) } },
      });
    });

    it('should move the balance effect to the new account when accountId changes', async () => {
      const newAccountId = 'new-account-id';
      mockPrisma.transaction.findUnique.mockResolvedValue(existing);
      mockPrisma.account.findUnique.mockResolvedValue({ id: newAccountId, userId, balance: new Decimal(0) });
      mockTx.transaction.update.mockResolvedValue(buildFullTransaction({ accountId: newAccountId }));

      await service.update(userId, transactionId, { accountId: newAccountId });

      expectBalanceIncrement(accountId, -10);
      expectBalanceIncrement(newAccountId, 10);
    });

    it('should reject moving the transaction to another user account', async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue(existing);
      mockPrisma.account.findUnique.mockResolvedValue({ id: 'foreign', userId: 'other-user', balance: new Decimal(0) });

      await expect(service.update(userId, transactionId, { accountId: 'foreign' })).rejects.toThrow(NotFoundException);
      expect(mockTx.account.update).not.toHaveBeenCalled();
    });

    it('should not touch the balance when amount, type and account are unchanged', async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue(existing);
      mockTx.transaction.update.mockResolvedValue(buildFullTransaction({ merchant: 'New' }));

      await service.update(userId, transactionId, { merchant: 'New' });

      expect(mockTx.account.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should revert an INCOME transaction from the balance', async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue({ id: transactionId, userId, accountId, amount: new Decimal(10), type: TransactionType.INCOME, deletedAt: null });

      await service.delete(userId, transactionId);

      expect(mockTx.transaction.update).toHaveBeenCalledWith({
        where: { id: transactionId },
        data: { deletedAt: expect.any(Date) },
      });
      expectBalanceIncrement(accountId, -10);
    });

    it('should revert an EXPENSE transaction from the balance', async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue({ id: transactionId, userId, accountId, amount: new Decimal(25.5), type: TransactionType.EXPENSE, deletedAt: null });

      await service.delete(userId, transactionId);

      expectBalanceIncrement(accountId, 25.5);
    });
  });

  describe('classify', () => {
    it('should classify an unclassified transaction', async () => {
      const dto: ClassifyTransactionDto = { categoryId };

      const transaction = {
        id: transactionId,
        userId,
        accountId,
        categoryId: null,
        status: TransactionStatus.UNCLASSIFIED,
        deletedAt: null,
      };

      const category = { id: categoryId, userId, name: 'Food' };
      const updated = {
        ...transaction,
        categoryId,
        status: TransactionStatus.CLASSIFIED,
        category,
        amount: new Decimal(25.5),
        currency: 'EUR',
        type: TransactionType.EXPENSE,
        source: TransactionSource.MANUAL,
        merchant: null,
        description: null,
        externalId: null,
        transactionDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        account: { id: accountId, name: 'Revolut' },
        subcategory: null,
      };

      mockPrisma.transaction.findUnique.mockResolvedValue(transaction);
      mockPrisma.category.findUnique.mockResolvedValue(category);
      mockPrisma.transaction.update.mockResolvedValue(updated);

      const result = await service.classify(userId, transactionId, dto);

      expect(result.status).toBe(TransactionStatus.CLASSIFIED);
      expect(result.categoryId).toBe(categoryId);
    });

    it('should throw ForbiddenException for another user category', async () => {
      const dto: ClassifyTransactionDto = { categoryId };

      const transaction = {
        id: transactionId,
        userId,
        accountId,
        categoryId: null,
        status: TransactionStatus.UNCLASSIFIED,
        deletedAt: null,
      };

      const category = { id: categoryId, userId: 'other-user', name: 'Food' };

      mockPrisma.transaction.findUnique.mockResolvedValue(transaction);
      mockPrisma.category.findUnique.mockResolvedValue(category);

      await expect(service.classify(userId, transactionId, dto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return paginated transactions with filters', async () => {
      const query: TransactionQueryDto = {
        page: 1,
        limit: 20,
        type: TransactionType.EXPENSE,
        status: TransactionStatus.UNCLASSIFIED,
      };

      const transactions = [
        {
          id: transactionId,
          userId,
          accountId,
          categoryId: null,
          amount: new Decimal(25.5),
          currency: 'EUR',
          type: TransactionType.EXPENSE,
          status: TransactionStatus.UNCLASSIFIED,
          source: TransactionSource.MANUAL,
          merchant: 'Test',
          description: null,
          externalId: null,
          transactionDate: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          account: { id: accountId, name: 'Revolut' },
          category: null,
          subcategory: null,
        },
      ];

      mockPrisma.transaction.findMany.mockResolvedValue(transactions);
      mockPrisma.transaction.count.mockResolvedValue(1);

      const result = await service.findAll(userId, query);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });
  });
});