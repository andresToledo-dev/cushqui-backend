import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
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
      updateMany: jest.fn(),
    },
    account: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    accountMovement: {
      create: jest.fn(),
      findUnique: jest.fn(),
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
      count: jest.fn(),
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
      const category = { id: categoryId, userId, name: 'Food', type: TransactionType.EXPENSE, parentId: null };
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

  describe('category type validation', () => {
    const categories: Record<string, any> = {
      food: { id: 'food', userId, name: 'Food', type: TransactionType.EXPENSE, parentId: null },
      salary: { id: 'salary', userId, name: 'Salary', type: TransactionType.INCOME, parentId: null },
      loans: { id: 'loans', userId, name: 'Loans', type: TransactionType.EXPENSE, parentId: null },
      jp: { id: 'jp', userId, name: 'JP', type: TransactionType.EXPENSE, parentId: 'loans' },
    };
    const baseDto = { accountId, amount: 20, transactionDate: '2026-10-02T12:00:00Z' };

    beforeEach(() => {
      mockPrisma.account.findUnique.mockResolvedValue({ id: accountId, userId, balance: new Decimal(80) });
      mockPrisma.category.findUnique.mockImplementation(({ where }: any) => Promise.resolve(categories[where.id] ?? null));
      mockTx.transaction.create.mockResolvedValue(buildFullTransaction());
      mockTx.transaction.update.mockResolvedValue(buildFullTransaction());
    });

    it('should reject an INCOME transaction with an EXPENSE category', async () => {
      await expect(service.create(userId, { ...baseDto, type: TransactionType.INCOME, categoryId: 'food' })).rejects.toThrow(BadRequestException);
      expect(mockTx.transaction.create).not.toHaveBeenCalled();
    });

    it('should accept a subcategory that belongs to the category', async () => {
      await service.create(userId, { ...baseDto, type: TransactionType.EXPENSE, categoryId: 'loans', subcategoryId: 'jp' });

      expect(mockTx.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ categoryId: 'loans', subcategoryId: 'jp' }) }),
      );
    });

    it('should reject a subcategory of another category', async () => {
      await expect(
        service.create(userId, { ...baseDto, type: TransactionType.EXPENSE, categoryId: 'food', subcategoryId: 'jp' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should turn an EXPENSE of 20 into an INCOME of 20: balance 60 → 100', async () => {
      // Account had 80, the expense left it at 60
      mockPrisma.transaction.findUnique.mockResolvedValue({
        id: transactionId, userId, accountId, categoryId: 'food', subcategoryId: null, status: TransactionStatus.CLASSIFIED,
        amount: new Decimal(20), type: TransactionType.EXPENSE, deletedAt: null,
      });

      await service.update(userId, transactionId, { type: TransactionType.INCOME, categoryId: 'salary' });

      // Revert the expense (+20 → 80) and apply the income (+20 → 100)
      expect(mockTx.account.update).toHaveBeenNthCalledWith(1, { where: { id: accountId }, data: { balance: { increment: new Decimal(20) } } });
      expect(mockTx.account.update).toHaveBeenNthCalledWith(2, { where: { id: accountId }, data: { balance: { increment: new Decimal(20) } } });
      expect(mockTx.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: TransactionType.INCOME, categoryId: 'salary' }) }),
      );
    });

    it('should reject changing the type while keeping a category of the old type', async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue({
        id: transactionId, userId, accountId, categoryId: 'food', subcategoryId: null, status: TransactionStatus.CLASSIFIED,
        amount: new Decimal(20), type: TransactionType.EXPENSE, deletedAt: null,
      });

      await expect(service.update(userId, transactionId, { type: TransactionType.INCOME })).rejects.toThrow(BadRequestException);
      expect(mockTx.account.update).not.toHaveBeenCalled();
    });

    it('should drop the old subcategory when the category changes without a new one', async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue({
        id: transactionId, userId, accountId, categoryId: 'loans', subcategoryId: 'jp', status: TransactionStatus.CLASSIFIED,
        amount: new Decimal(20), type: TransactionType.EXPENSE, deletedAt: null,
      });

      await service.update(userId, transactionId, { categoryId: 'food' });

      expect(mockTx.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ categoryId: 'food', subcategoryId: null }) }),
      );
    });

    it('should reject classifying with a category of another type', async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue({
        id: transactionId, userId, accountId, categoryId: null, subcategoryId: null, status: TransactionStatus.UNCLASSIFIED,
        amount: new Decimal(20), type: TransactionType.INCOME, deletedAt: null,
      });

      await expect(service.classify(userId, transactionId, { categoryId: 'food' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    const existing ={ id: transactionId, userId, accountId, categoryId: null, status: TransactionStatus.UNCLASSIFIED, amount: new Decimal(10), type: TransactionType.INCOME, deletedAt: null };

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

  describe('closed account', () => {
    const existing = { id: transactionId, userId, accountId, amount: new Decimal(10), type: TransactionType.EXPENSE, status: TransactionStatus.UNCLASSIFIED, categoryId: null, subcategoryId: null, deletedAt: null };

    beforeEach(() => {
      jest.clearAllMocks();
      mockPrisma.transaction.findUnique.mockResolvedValue(existing);
      mockPrisma.account.count.mockReset();
      mockPrisma.account.count.mockResolvedValue(1);
    });

    it('should reject creating a transaction', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({ id: accountId, userId });

      await expect(
        service.create(userId, { accountId, amount: 10, currency: 'EUR', type: TransactionType.EXPENSE, transactionDate: new Date().toISOString() } as CreateTransactionDto),
      ).rejects.toThrow('Account is inactive');
      expect(mockTx.transaction.create).not.toHaveBeenCalled();
    });

    it('should reject deleting a transaction', async () => {
      await expect(service.delete(userId, transactionId)).rejects.toThrow('Account is inactive');
      expect(mockTx.transaction.update).not.toHaveBeenCalled();
    });

    it('should reject changing the amount', async () => {
      await expect(service.update(userId, transactionId, { amount: 20 })).rejects.toThrow('Account is inactive');
      expect(mockTx.transaction.update).not.toHaveBeenCalled();
    });

    it('should check both accounts when the transaction moves to another account', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({ id: 'other-account', userId });

      await expect(service.update(userId, transactionId, { accountId: 'other-account' })).rejects.toThrow('Account is inactive');
      expect(mockPrisma.account.count).toHaveBeenCalledWith({
        where: { id: { in: [accountId, 'other-account'] }, isActive: false },
      });
    });

    it('should allow an edit that resends the same amount and type, without touching the balance', async () => {
      mockTx.transaction.update.mockResolvedValue({ ...existing, merchant: 'Bar', currency: 'EUR', source: TransactionSource.MANUAL, transactionDate: new Date(), createdAt: new Date(), updatedAt: new Date(), account: { name: 'Revolut' }, category: null, subcategory: null });

      await service.update(userId, transactionId, { amount: 10, type: TransactionType.EXPENSE, merchant: 'Bar' });

      expect(mockPrisma.account.count).not.toHaveBeenCalled();
      expect(mockTx.account.update).not.toHaveBeenCalled();
    });
  });

  describe('convertToTransfer', () => {
    const date = new Date('2026-11-01T10:00:00.000Z');
    const otherAccountId = 'other-account';
    const buildConvertible = (overrides: Record<string, unknown> = {}) => ({
      id: transactionId,
      userId,
      accountId,
      amount: new Decimal(500),
      currency: 'EUR',
      type: TransactionType.EXPENSE,
      status: TransactionStatus.UNCLASSIFIED,
      merchant: 'Juan',
      transactionDate: date,
      deletedAt: null,
      ...overrides,
    });
    const income = buildConvertible({ id: 'income-id', accountId: otherAccountId, type: TransactionType.INCOME, merchant: null, transactionDate: new Date('2026-11-01T11:00:00.000Z') });
    const mockTransactions = (...rows: Record<string, unknown>[]) =>
      mockPrisma.transaction.findUnique.mockImplementation(({ where }: any) => Promise.resolve(rows.find((row) => row.id === where.id) ?? null));

    beforeEach(() => {
      jest.clearAllMocks();
      mockPrisma.account.count.mockReset();
      mockPrisma.account.count.mockResolvedValue(0);
      mockPrisma.account.findUnique.mockResolvedValue({ id: otherAccountId, userId, currency: 'EUR' });
      mockTx.accountMovement.create.mockResolvedValue({ id: 'movement-id' });
      mockTx.transaction.updateMany.mockImplementation(({ where }: any) => Promise.resolve({ count: where.id.in.length }));
      mockTx.accountMovement.findUnique.mockResolvedValue({
        id: 'movement-id',
        type: 'TRANSFER',
        amount: new Decimal(500),
        currency: 'EUR',
        balanceBefore: null,
        balanceAfter: null,
        note: 'Juan',
        movementDate: date,
        createdAt: date,
        updatedAt: date,
        account: { id: accountId, name: 'A' },
        toAccount: { id: otherAccountId, name: 'B' },
      });
    });

    it('should turn an expense into a transfer and change only the other account (A 500, B 200 → 700)', async () => {
      mockTransactions(buildConvertible());

      const result = await service.convertToTransfer(userId, transactionId, { otherAccountId });

      expect(mockTx.accountMovement.create.mock.calls[0][0].data).toMatchObject({
        type: 'TRANSFER',
        accountId,
        toAccountId: otherAccountId,
        note: 'Juan',
        movementDate: date,
      });
      expect(mockTx.transaction.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [transactionId] }, deletedAt: null, status: TransactionStatus.UNCLASSIFIED },
        data: { deletedAt: expect.any(Date), convertedToMovementId: 'movement-id' },
      });
      expect(mockTx.account.update).toHaveBeenCalledTimes(1);
      expectBalanceIncrement(otherAccountId, 500);
      expect(result.id).toBe('movement-id');
    });

    it('should turn an income into a transfer from the other account, which goes down', async () => {
      mockTransactions(buildConvertible({ type: TransactionType.INCOME }));

      await service.convertToTransfer(userId, transactionId, { otherAccountId });

      expect(mockTx.accountMovement.create.mock.calls[0][0].data).toMatchObject({ accountId: otherAccountId, toAccountId: accountId });
      expect(mockTx.account.update).toHaveBeenCalledTimes(1);
      expectBalanceIncrement(otherAccountId, -500);
    });

    it.each([
      ['the expense', transactionId, 'income-id'],
      ['the income', 'income-id', transactionId],
    ])('should convert both sides from %s without changing any balance', async (_label, id, otherTransactionId) => {
      mockTransactions(buildConvertible(), income);

      await service.convertToTransfer(userId, id, { otherTransactionId });

      expect(mockTx.accountMovement.create.mock.calls[0][0].data).toMatchObject({
        accountId,
        toAccountId: otherAccountId,
        note: 'Juan',
        movementDate: date,
      });
      expect(mockTx.transaction.updateMany.mock.calls[0][0].where.id.in).toEqual(expect.arrayContaining([transactionId, 'income-id']));
      expect(mockTx.account.update).not.toHaveBeenCalled();
    });

    it('should use the note it receives', async () => {
      mockTransactions(buildConvertible());

      await service.convertToTransfer(userId, transactionId, { otherAccountId, note: 'Savings' });

      expect(mockTx.accountMovement.create.mock.calls[0][0].data.note).toBe('Savings');
    });

    it.each([
      ['neither identifier', {}],
      ['both identifiers', { otherAccountId, otherTransactionId: 'income-id' }],
    ])('should reject %s', async (_label, dto) => {
      await expect(service.convertToTransfer(userId, transactionId, dto)).rejects.toThrow('Send exactly one of');
    });

    it.each([
      ['deleted', { deletedAt: new Date() }],
      ['of another user', { userId: 'other-user' }],
    ])('should return 404 for a transaction that is %s', async (_label, overrides) => {
      mockTransactions(buildConvertible(overrides));

      await expect(service.convertToTransfer(userId, transactionId, { otherAccountId })).rejects.toThrow(NotFoundException);
    });

    it('should reject a classified transaction', async () => {
      mockTransactions(buildConvertible({ status: TransactionStatus.CLASSIFIED }));

      await expect(service.convertToTransfer(userId, transactionId, { otherAccountId })).rejects.toThrow('Only unclassified');
    });

    it('should reject a classified other side', async () => {
      mockTransactions(buildConvertible(), { ...income, status: TransactionStatus.CLASSIFIED });

      await expect(service.convertToTransfer(userId, transactionId, { otherTransactionId: 'income-id' })).rejects.toThrow('Only unclassified');
    });

    it.each([
      ['the same type', { type: TransactionType.EXPENSE }],
      ['another amount', { amount: new Decimal(499) }],
    ])('should reject another side with %s', async (_label, overrides) => {
      mockTransactions(buildConvertible(), { ...income, ...overrides });

      await expect(service.convertToTransfer(userId, transactionId, { otherTransactionId: 'income-id' })).rejects.toThrow(BadRequestException);
    });

    it('should reject the same account', async () => {
      mockTransactions(buildConvertible());

      await expect(service.convertToTransfer(userId, transactionId, { otherAccountId: accountId })).rejects.toThrow('same account');
    });

    it('should return 404 for an account of another user', async () => {
      mockTransactions(buildConvertible());
      mockPrisma.account.findUnique.mockResolvedValue({ id: otherAccountId, userId: 'other-user', currency: 'EUR' });

      await expect(service.convertToTransfer(userId, transactionId, { otherAccountId })).rejects.toThrow(NotFoundException);
    });

    it('should reject another currency', async () => {
      mockTransactions(buildConvertible());
      mockPrisma.account.findUnique.mockResolvedValue({ id: otherAccountId, userId, currency: 'USD' });

      await expect(service.convertToTransfer(userId, transactionId, { otherAccountId })).rejects.toThrow('Currency mismatch');
    });

    it('should reject a closed account', async () => {
      mockTransactions(buildConvertible());
      mockPrisma.account.count.mockResolvedValue(1);

      await expect(service.convertToTransfer(userId, transactionId, { otherAccountId })).rejects.toThrow('Account is inactive');
      expect(mockTx.accountMovement.create).not.toHaveBeenCalled();
    });

    it('should fail without changing balances when it was converted concurrently', async () => {
      mockTransactions(buildConvertible());
      mockTx.transaction.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.convertToTransfer(userId, transactionId, { otherAccountId })).rejects.toThrow(ConflictException);
      expect(mockTx.account.update).not.toHaveBeenCalled();
    });
  });

  describe('findTransferCandidates', () => {
    const date = new Date('2026-11-10T12:00:00.000Z');

    it('should search the opposite type, same amount and other active accounts, closest first', async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue({
        id: transactionId,
        userId,
        accountId,
        amount: new Decimal(500),
        currency: 'EUR',
        type: TransactionType.EXPENSE,
        status: TransactionStatus.UNCLASSIFIED,
        transactionDate: date,
        deletedAt: null,
      });
      mockPrisma.transaction.findMany.mockResolvedValue([
        buildFullTransaction({ id: 'far', transactionDate: new Date('2026-11-12T12:00:00.000Z') }),
        buildFullTransaction({ id: 'near', transactionDate: new Date('2026-11-10T13:00:00.000Z') }),
      ]);

      const result = await service.findTransferCandidates(userId, transactionId);

      expect(mockPrisma.transaction.findMany.mock.calls[0][0].where).toMatchObject({
        userId,
        deletedAt: null,
        status: TransactionStatus.UNCLASSIFIED,
        type: TransactionType.INCOME,
        amount: new Decimal(500),
        currency: 'EUR',
        accountId: { not: accountId },
        account: { isActive: true },
        transactionDate: { gte: new Date('2026-11-07T12:00:00.000Z'), lte: new Date('2026-11-13T12:00:00.000Z') },
      });
      expect(result.map((candidate) => candidate.id)).toEqual(['near', 'far']);
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