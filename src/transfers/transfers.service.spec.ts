import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TransfersService } from './transfers.service';
import { PrismaService } from '../prisma/prisma.service';
import { MovementType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

describe('TransfersService', () => {
  let service: TransfersService;

  const mockPrisma: any = {
    account: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    accountMovement: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrisma)),
  };

  const userId = 'user-id';
  const accounts: Record<string, any> = {
    revolut: { id: 'revolut', userId, name: 'Revolut', currency: 'EUR', balance: new Decimal(510) },
    caixa: { id: 'caixa', userId, name: 'Caixa', currency: 'EUR', balance: new Decimal(10) },
    cash: { id: 'cash', userId, name: 'Cash', currency: 'EUR', balance: new Decimal(50) },
    foreign: { id: 'foreign', userId: 'other-user', name: 'Foreign', currency: 'EUR', balance: new Decimal(0) },
  };

  const existingTransfer = {
    id: 'transfer-id',
    userId,
    type: MovementType.TRANSFER,
    accountId: 'revolut',
    toAccountId: 'caixa',
    amount: new Decimal(30),
    currency: 'EUR',
  };

  const expectBalanceIncrement = (id: string, delta: number) =>
    expect(mockPrisma.account.update).toHaveBeenCalledWith({
      where: { id },
      data: { balance: { increment: new Decimal(delta) } },
    });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TransfersService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<TransfersService>(TransfersService);

    jest.clearAllMocks();
    mockPrisma.account.findUnique.mockImplementation(({ where }: any) => Promise.resolve(accounts[where.id] ?? null));
    mockPrisma.accountMovement.update.mockImplementation(({ data }: any) =>
      Promise.resolve({
        ...existingTransfer,
        ...data,
        balanceBefore: null,
        balanceAfter: null,
        note: data.note ?? null,
        movementDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        account: { id: data.accountId, name: accounts[data.accountId].name },
        toAccount: { id: data.toAccountId, name: accounts[data.toAccountId].name },
      }),
    );
  });

  describe('create', () => {
    const dto = { fromAccountId: 'revolut', toAccountId: 'caixa', amount: 30, currency: 'EUR', date: '2026-10-13T10:00:00Z' };

    it('should record a single TRANSFER movement and move the balance', async () => {
      mockPrisma.accountMovement.create.mockResolvedValue({ id: 'movement-id' });

      const result = await service.create(userId, dto);

      expect(mockPrisma.accountMovement.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.accountMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: MovementType.TRANSFER,
          accountId: 'revolut',
          toAccountId: 'caixa',
          amount: new Decimal(30),
        }),
      });
      expectBalanceIncrement('revolut', -30);
      expectBalanceIncrement('caixa', 30);
      expect(result.movementId).toBe('movement-id');
    });

    it('should reject a transfer to the same account', async () => {
      await expect(service.create(userId, { ...dto, toAccountId: 'revolut' })).rejects.toThrow(BadRequestException);
    });

    it('should reject a transfer with insufficient balance', async () => {
      await expect(service.create(userId, { ...dto, amount: 1000 })).rejects.toThrow(BadRequestException);
      expect(mockPrisma.accountMovement.create).not.toHaveBeenCalled();
    });

    it('should reject a transfer to another user account', async () => {
      await expect(service.create(userId, { ...dto, toAccountId: 'foreign' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should revert the old amount and apply the new one on the same accounts', async () => {
      mockPrisma.accountMovement.findUnique.mockResolvedValue(existingTransfer);

      const result = await service.update(userId, 'transfer-id', { amount: 20 });

      expect(mockPrisma.account.update).toHaveBeenCalledTimes(4);
      expectBalanceIncrement('revolut', 30);
      expectBalanceIncrement('caixa', -30);
      expectBalanceIncrement('revolut', -20);
      expectBalanceIncrement('caixa', 20);
      expect(mockPrisma.accountMovement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'transfer-id' },
          data: expect.objectContaining({ amount: new Decimal(20) }),
        }),
      );
      expect(mockPrisma.accountMovement.create).not.toHaveBeenCalled();
      expect(result.amount).toBe(20);
    });

    it('should move the balance to the new destination account', async () => {
      mockPrisma.accountMovement.findUnique.mockResolvedValue(existingTransfer);

      await service.update(userId, 'transfer-id', { toAccountId: 'cash' });

      expectBalanceIncrement('caixa', -30);
      expectBalanceIncrement('cash', 30);
    });

    it('should not touch balances when only the note changes', async () => {
      mockPrisma.accountMovement.findUnique.mockResolvedValue(existingTransfer);

      await service.update(userId, 'transfer-id', { note: 'Rent' });

      expect(mockPrisma.account.update).not.toHaveBeenCalled();
      expect(mockPrisma.accountMovement.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ note: 'Rent' }) }),
      );
    });

    it('should count the reverted amount as available in the source account', async () => {
      // Revolut has 510 now; reverting the 30 transfer makes 540 available
      mockPrisma.accountMovement.findUnique.mockResolvedValue(existingTransfer);

      await expect(service.update(userId, 'transfer-id', { amount: 540 })).resolves.toBeDefined();
      await expect(service.update(userId, 'transfer-id', { amount: 541 })).rejects.toThrow(BadRequestException);
    });

    it.each([MovementType.OPENING, MovementType.ADJUSTMENT])('should not allow editing an %s', async (type) => {
      mockPrisma.accountMovement.findUnique.mockResolvedValue({ ...existingTransfer, type, toAccountId: null });

      await expect(service.update(userId, 'transfer-id', { amount: 20 })).rejects.toThrow(NotFoundException);
      expect(mockPrisma.account.update).not.toHaveBeenCalled();
    });

    it('should not allow editing another user transfer', async () => {
      mockPrisma.accountMovement.findUnique.mockResolvedValue({ ...existingTransfer, userId: 'other-user' });

      await expect(service.update(userId, 'transfer-id', { amount: 20 })).rejects.toThrow(NotFoundException);
    });

    it('should not allow moving the transfer to another user account', async () => {
      mockPrisma.accountMovement.findUnique.mockResolvedValue(existingTransfer);

      await expect(service.update(userId, 'transfer-id', { toAccountId: 'foreign' })).rejects.toThrow(NotFoundException);
      expect(mockPrisma.account.update).not.toHaveBeenCalled();
    });
  });
});
