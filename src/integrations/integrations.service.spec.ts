import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { IntegrationType } from '@prisma/client';
import { IntegrationsService } from './integrations.service';
import { PrismaService } from '../prisma/prisma.service';

describe('IntegrationsService', () => {
  let service: IntegrationsService;
  const userId = 'user-id';

  const mockPrisma = {
    account: { findUnique: jest.fn() },
    integration: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const row = (overrides: Record<string, unknown> = {}) => ({
    id: 'integration-id',
    userId,
    accountId: null,
    name: 'Revolut',
    type: IntegrationType.NOTIFICATION,
    tokenHash: 'hash',
    expenseWords: 'has enviado,has gastado',
    incomeWords: 'has recibido',
    isActive: true,
    lastUsedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [IntegrationsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(IntegrationsService);
    mockPrisma.integration.create.mockImplementation(({ data }) => Promise.resolve(row(data)));
    mockPrisma.integration.update.mockImplementation(({ data }) => Promise.resolve(row(data)));
  });

  describe('create', () => {
    it('should store the normalized words of a NOTIFICATION integration and return them', async () => {
      const result = await service.create(userId, {
        name: 'Caixa',
        type: IntegrationType.NOTIFICATION,
        expenseWords: ' Caixa Geral , pagaste,,',
        incomeWords: 'te depositaron, te han enviado ',
      });

      const { data } = mockPrisma.integration.create.mock.calls[0][0];
      expect(data).toMatchObject({ expenseWords: 'Caixa Geral,pagaste', incomeWords: 'te depositaron,te han enviado' });
      expect(result).toMatchObject({ expenseWords: 'Caixa Geral,pagaste', incomeWords: 'te depositaron,te han enviado' });
      expect(result.plainToken).toBeDefined();
    });

    it.each([
      ['without expenseWords', { incomeWords: 'has recibido' }],
      ['without incomeWords', { expenseWords: 'has enviado' }],
      ['with an empty list', { expenseWords: ' , ', incomeWords: 'has recibido' }],
    ])('should reject a NOTIFICATION integration %s', async (_label, words) => {
      await expect(service.create(userId, { name: 'N', type: IntegrationType.NOTIFICATION, ...words })).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.integration.create).not.toHaveBeenCalled();
    });

    it('should create a MANUAL integration without words and reject one with words', async () => {
      mockPrisma.integration.create.mockImplementationOnce(({ data }) =>
        Promise.resolve(row({ expenseWords: null, incomeWords: null, ...data })),
      );
      const result = await service.create(userId, { name: 'M', type: IntegrationType.MANUAL });
      expect(mockPrisma.integration.create.mock.calls[0][0].data).not.toHaveProperty('expenseWords');
      expect(result.expenseWords).toBeNull();

      await expect(service.create(userId, { name: 'M', type: IntegrationType.MANUAL, expenseWords: 'x' })).rejects.toThrow(
        'Only NOTIFICATION integrations use expense/income words',
      );
    });
  });

  describe('update', () => {
    it('should update only the list that is sent, normalized', async () => {
      mockPrisma.integration.findUnique.mockResolvedValue(row());

      await service.update(userId, 'integration-id', { incomeWords: 'te depositaron, ' });

      const { data } = mockPrisma.integration.update.mock.calls[0][0];
      expect(data.incomeWords).toBe('te depositaron');
      expect(data).not.toHaveProperty('expenseWords');
    });

    it('should reject leaving a list empty', async () => {
      mockPrisma.integration.findUnique.mockResolvedValue(row());

      await expect(service.update(userId, 'integration-id', { expenseWords: ' ' })).rejects.toThrow(BadRequestException);
      expect(mockPrisma.integration.update).not.toHaveBeenCalled();
    });

    it('should reject words on a MANUAL integration', async () => {
      mockPrisma.integration.findUnique.mockResolvedValue(row({ type: IntegrationType.MANUAL, expenseWords: null, incomeWords: null }));

      await expect(service.update(userId, 'integration-id', { incomeWords: 'x' })).rejects.toThrow(BadRequestException);
    });
  });
});
