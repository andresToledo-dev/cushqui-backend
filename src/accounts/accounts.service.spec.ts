import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { AccountType, MovementType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

describe('AccountsService', () => {
  let service: AccountsService;

  const mockPrisma: any = {
    account: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    accountMovement: {
      create: jest.fn(),
      count: jest.fn(),
    },
    transaction: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    // Interactive transactions run against the same mock
    $transaction: jest.fn((callback) => callback(mockPrisma)),
  };

  const userId = 'user-id';
  const accountId = 'account-id';

  const buildAccount = (overrides: Record<string, unknown> = {}) => ({
    id: accountId,
    userId,
    name: 'Revolut',
    type: AccountType.BANK,
    currency: 'EUR',
    balance: new Decimal(1000),
    isActive: true,
    icon: null,
    color: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AccountsService>(AccountsService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create an account with the given balance and record its OPENING', async () => {
      const dto: CreateAccountDto = {
        name: 'Revolut',
        type: AccountType.BANK,
        currency: 'EUR',
        balance: 500,
      };

      mockPrisma.account.create.mockResolvedValue(buildAccount({ balance: new Decimal(500) }));

      const result = await service.create(userId, dto);

      expect(mockPrisma.account.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ balance: new Decimal(500) }),
      });
      expect(mockPrisma.accountMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          type: MovementType.OPENING,
          accountId,
          amount: new Decimal(500),
          currency: 'EUR',
        }),
      });
      expect(result).toEqual(
        expect.objectContaining({ id: accountId, name: dto.name, type: dto.type, currency: dto.currency, balance: 500 }),
      );
    });

    it('should use openingDate as the OPENING movement date', async () => {
      mockPrisma.account.create.mockResolvedValue(buildAccount({ balance: new Decimal(0) }));

      await service.create(userId, { name: 'Principal', type: AccountType.BANK, openingDate: '2024-02-27T00:00:00.000Z' });

      expect(mockPrisma.accountMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: MovementType.OPENING,
          movementDate: new Date('2024-02-27T00:00:00.000Z'),
        }),
      });
    });

    it('should record an OPENING of 0 when no balance is provided', async () => {
      mockPrisma.account.create.mockResolvedValue(buildAccount({ balance: new Decimal(0) }));

      const result = await service.create(userId, { name: 'Cash', type: AccountType.CASH });

      expect(mockPrisma.account.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ balance: new Decimal(0) }),
      });
      expect(mockPrisma.accountMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: MovementType.OPENING, amount: new Decimal(0) }),
      });
      expect(result.balance).toBe(0);
    });
  });

  describe('findAll', () => {
    it('should return all accounts for user', async () => {
      const accounts = [
        buildAccount({ id: '1' }),
        buildAccount({ id: '2', name: 'Cash', type: AccountType.CASH, balance: new Decimal(50) }),
      ];

      mockPrisma.account.findMany.mockResolvedValue(accounts);

      const result = await service.findAll(userId);

      expect(result).toHaveLength(2);
      expect(result[1].balance).toBe(50);
      expect(mockPrisma.account.findMany).toHaveBeenCalledWith({
        where: { userId, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('findById', () => {
    it('should return account if belongs to user', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(buildAccount());

      const result = await service.findById(userId, accountId);

      expect(result.id).toBe(accountId);
      expect(result.balance).toBe(1000);
    });

    it('should throw NotFoundException if account not found', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null);

      await expect(service.findById(userId, accountId)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if account belongs to another user', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(buildAccount({ userId: 'other-user' }));

      await expect(service.findById(userId, accountId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should never touch the balance', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(buildAccount());
      mockPrisma.account.update.mockResolvedValue(buildAccount({ icon: '🍀' }));

      await service.update(userId, accountId, { icon: '🍀' });

      expect(mockPrisma.account.update.mock.calls[0][0].data).not.toHaveProperty('balance');
      expect(mockPrisma.accountMovement.create).not.toHaveBeenCalled();
    });
  });

  describe('adjust', () => {
    it('should record a positive ADJUSTMENT when the balance goes up', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(buildAccount({ balance: new Decimal(500) }));
      mockPrisma.account.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.adjust(userId, accountId, { balance: 510, note: 'Missing income' });

      expect(mockPrisma.account.updateMany).toHaveBeenCalledWith({
        where: { id: accountId, balance: new Decimal(500) },
        data: { balance: new Decimal(510) },
      });
      expect(mockPrisma.accountMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: MovementType.ADJUSTMENT,
          accountId,
          amount: new Decimal(10),
          balanceBefore: new Decimal(500),
          balanceAfter: new Decimal(510),
          note: 'Missing income',
        }),
      });
      expect(result.balance).toBe(510);
    });

    it('should record a negative ADJUSTMENT when the balance goes down', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(buildAccount({ balance: new Decimal(300) }));
      mockPrisma.account.updateMany.mockResolvedValue({ count: 1 });

      await service.adjust(userId, accountId, { balance: 290 });

      expect(mockPrisma.accountMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ amount: new Decimal(-10) }),
      });
    });

    it('should use the given date as the ADJUSTMENT movement date', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(buildAccount({ balance: new Decimal(300) }));
      mockPrisma.account.updateMany.mockResolvedValue({ count: 1 });

      await service.adjust(userId, accountId, { balance: 290, date: '2025-01-15T00:00:00.000Z' });

      expect(mockPrisma.accountMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: MovementType.ADJUSTMENT,
          movementDate: new Date('2025-01-15T00:00:00.000Z'),
        }),
      });
    });

    it('should do nothing when the balance does not change', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(buildAccount({ balance: new Decimal(300) }));

      const result = await service.adjust(userId, accountId, { balance: 300 });

      expect(mockPrisma.account.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.accountMovement.create).not.toHaveBeenCalled();
      expect(result.balance).toBe(300);
    });

    it('should throw ConflictException when the balance changed concurrently', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(buildAccount({ balance: new Decimal(300) }));
      mockPrisma.account.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.adjust(userId, accountId, { balance: 310 })).rejects.toThrow(ConflictException);
      expect(mockPrisma.accountMovement.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for another user account', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(buildAccount({ userId: 'other-user' }));

      await expect(service.adjust(userId, accountId, { balance: 310 })).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should hard delete an account that only has its OPENING', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(buildAccount());
      mockPrisma.transaction.count.mockResolvedValue(0);
      mockPrisma.accountMovement.count.mockResolvedValue(0);

      await service.delete(userId, accountId);

      expect(mockPrisma.accountMovement.count).toHaveBeenCalledWith({
        where: {
          OR: [{ accountId }, { toAccountId: accountId }],
          type: { not: MovementType.OPENING },
        },
      });
      expect(mockPrisma.account.delete).toHaveBeenCalledWith({ where: { id: accountId } });
    });

    it('should soft delete an account with adjustments or transfers', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(buildAccount());
      mockPrisma.transaction.count.mockResolvedValue(0);
      mockPrisma.accountMovement.count.mockResolvedValue(1);

      await service.delete(userId, accountId);

      expect(mockPrisma.account.delete).not.toHaveBeenCalled();
      expect(mockPrisma.account.update).toHaveBeenCalledWith({
        where: { id: accountId },
        data: { isActive: false },
      });
    });
  });

  describe('getBalance', () => {
    it('should return the stored balance', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(buildAccount({ balance: new Decimal(1200) }));

      const result = await service.getBalance(userId, accountId);

      expect(result.balance).toBe(1200);
      expect(mockPrisma.transaction.findMany).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if account belongs to another user', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(buildAccount({ userId: 'other-user' }));

      await expect(service.getBalance(userId, accountId)).rejects.toThrow(NotFoundException);
    });
  });
});
