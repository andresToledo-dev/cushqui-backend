import { Test, TestingModule } from '@nestjs/testing';
import { MovementsService } from './movements.service';
import { PrismaService } from '../prisma/prisma.service';
import { MovementType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

describe('MovementsService', () => {
  let service: MovementsService;

  const mockPrisma = {
    accountMovement: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  const userId = 'user-id';

  const buildMovement = (overrides: Record<string, unknown> = {}) => ({
    id: 'movement-id',
    userId,
    type: MovementType.TRANSFER,
    accountId: 'revolut',
    toAccountId: 'caixa',
    amount: new Decimal(30),
    balanceBefore: null,
    balanceAfter: null,
    currency: 'EUR',
    note: null,
    movementDate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    account: { id: 'revolut', name: 'Revolut' },
    toAccount: { id: 'caixa', name: 'Caixa' },
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MovementsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<MovementsService>(MovementsService);

    jest.clearAllMocks();
  });

  it('should return the user movements paginated and mapped', async () => {
    mockPrisma.accountMovement.findMany.mockResolvedValue([
      buildMovement(),
      buildMovement({
        id: 'adjust-id',
        type: MovementType.ADJUSTMENT,
        toAccountId: null,
        toAccount: null,
        amount: new Decimal(-10),
        balanceBefore: new Decimal(300),
        balanceAfter: new Decimal(290),
      }),
    ]);
    mockPrisma.accountMovement.count.mockResolvedValue(2);

    const result = await service.findAll(userId, { page: 1, limit: 20 });

    expect(mockPrisma.accountMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId }, skip: 0, take: 20 }),
    );
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        type: MovementType.TRANSFER,
        amount: 30,
        account: { id: 'revolut', name: 'Revolut' },
        toAccount: { id: 'caixa', name: 'Caixa' },
      }),
    );
    expect(result.data[1]).toEqual(
      expect.objectContaining({ type: MovementType.ADJUSTMENT, amount: -10, balanceBefore: 300, balanceAfter: 290 }),
    );
    expect(result.data[1].toAccount).toBeUndefined();
  });

  it('should filter by account as source or destination', async () => {
    mockPrisma.accountMovement.findMany.mockResolvedValue([]);
    mockPrisma.accountMovement.count.mockResolvedValue(0);

    await service.findAll(userId, { accountId: 'caixa', type: MovementType.TRANSFER, page: 2, limit: 10 });

    expect(mockPrisma.accountMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId,
          OR: [{ accountId: 'caixa' }, { toAccountId: 'caixa' }],
          type: MovementType.TRANSFER,
        },
        skip: 10,
        take: 10,
      }),
    );
  });
});
