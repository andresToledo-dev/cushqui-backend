import { Test, TestingModule } from '@nestjs/testing';
import { Decimal } from '@prisma/client/runtime/library';
import { StatisticsService } from './statistics.service';
import { PrismaService } from '../prisma/prisma.service';

describe('StatisticsService', () => {
  let service: StatisticsService;

  const mockPrisma = {
    account: { findMany: jest.fn() },
    transaction: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StatisticsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(StatisticsService);

    jest.clearAllMocks();
    mockPrisma.account.findMany.mockResolvedValue([{ id: 'acc-1', name: 'Revolut', balance: new Decimal(0) }]);
    mockPrisma.transaction.findMany.mockResolvedValue([]);
  });

  it.each([
    ['categories', (s: StatisticsService) => s.getCategoriesStats('user-id', {})],
    ['accounts', (s: StatisticsService) => s.getAccountsStats('user-id', {})],
    ['monthly', (s: StatisticsService) => s.getMonthlyStats('user-id', {})],
  ])('%s stats should ignore deleted transactions', async (_name, getStats) => {
    await getStats(service);

    expect(mockPrisma.transaction.findMany).toHaveBeenCalled();
    for (const [args] of mockPrisma.transaction.findMany.mock.calls) {
      expect(args.where.deletedAt).toBeNull();
    }
  });
});
