import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: PrismaService;

  const mockPrisma = {
    account: {
      findMany: jest.fn(),
    },
    transaction: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  const userId = 'user-id';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  describe('getDashboard', () => {
    it('should return dashboard data with correct calculations', async () => {
      const accounts = [
        { id: 'acc-1', balance: new Decimal(1300) },
        { id: 'acc-2', balance: new Decimal(500) },
      ];

      const monthlyTransactions = [
        { type: 'INCOME', amount: new Decimal(1800) },
        { type: 'EXPENSE', amount: new Decimal(850) },
      ];

      mockPrisma.account.findMany.mockResolvedValue(accounts);
      mockPrisma.transaction.findMany.mockResolvedValueOnce(monthlyTransactions);
      mockPrisma.transaction.count.mockResolvedValue(4);

      const result = await service.getDashboard(userId);

      expect(result.totalBalance).toBe(1800);
      expect(result.monthlyIncome).toBe(1800);
      expect(result.monthlyExpenses).toBe(850);
      expect(result.unclassifiedCount).toBe(4);
    });

    it('should handle empty accounts', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.transaction.findMany.mockResolvedValue([]);
      mockPrisma.transaction.count.mockResolvedValue(0);

      const result = await service.getDashboard(userId);

      expect(result.totalBalance).toBe(0);
      expect(result.monthlyIncome).toBe(0);
      expect(result.monthlyExpenses).toBe(0);
      expect(result.unclassifiedCount).toBe(0);
    });
  });
});