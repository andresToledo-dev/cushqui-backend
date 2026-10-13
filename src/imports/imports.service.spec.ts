import { Test, TestingModule } from '@nestjs/testing';
import { ImportsService } from './imports.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShortcutImportDto } from './dto/shortcut-import.dto';
import { TransactionSource, TransactionType, TransactionStatus, FinalDecision } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

describe('ImportsService', () => {
  let service: ImportsService;
  let prisma: PrismaService;

  const mockTx = {
    transaction: {
      create: jest.fn(),
    },
    account: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockPrisma = {
    importEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    transaction: {
      create: jest.fn(),
    },
    integration: {
      update: jest.fn(),
    },
    account: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockTx)),
  };

  const userId = 'user-id';
  const integrationId = 'integration-id';
  const accountId = 'account-id';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ImportsService>(ImportsService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  describe('importFromShortcut', () => {
    it('should create new EXPENSE transaction for "has enviado" message', async () => {
      const dto: ShortcutImportDto = {
        message: 'Has enviado 15.90€ a Juan Pablo. Llegará en segundos',
        date: '2026-10-02T12:00:00Z',
      };

      mockPrisma.importEvent.findUnique.mockResolvedValue(null);
      mockTx.transaction.create.mockResolvedValue({
        id: 'new-transaction-id',
        userId,
        accountId,
        amount: new Decimal(15.9),
        currency: 'EUR',
        type: TransactionType.EXPENSE,
        status: TransactionStatus.UNCLASSIFIED,
        source: TransactionSource.REVOLUT,
        merchant: 'Juan Pablo',
        transactionDate: new Date(dto.date),
      });
      mockPrisma.importEvent.create.mockResolvedValue({});
      mockPrisma.integration.update.mockResolvedValue({});
      mockTx.account.update.mockResolvedValue({});

      const result = await service.importFromShortcut(userId, integrationId, accountId, dto);

      expect(result).toEqual({
        success: true,
        created: true,
        transactionId: 'new-transaction-id',
      });
      expect(mockTx.transaction.create).toHaveBeenCalled();
      expect(mockPrisma.importEvent.create).toHaveBeenCalled();
      expect(mockTx.account.update).toHaveBeenCalledWith({
        where: { id: accountId },
        data: { balance: { increment: new Decimal(-15.9) } },
      });

      // Verify importEvent was created with correct finalDecision
      const importEventCall = mockPrisma.importEvent.create.mock.calls[0][0];
      expect(importEventCall.data.finalDecision).toBe(FinalDecision.EXPENSE);
      expect(importEventCall.data.message).toBe(dto.message);
    });

    it('should create new INCOME transaction for "has recibido" message', async () => {
      const dto: ShortcutImportDto = {
        message: 'Has recibido 100.00€ de Empresa SL. Llegará en segundos',
        date: '2026-10-02T12:00:00Z',
      };

      mockPrisma.importEvent.findUnique.mockResolvedValue(null);
      mockTx.transaction.create.mockResolvedValue({
        id: 'new-transaction-id',
        userId,
        accountId,
        amount: new Decimal(100),
        currency: 'EUR',
        type: TransactionType.INCOME,
        status: TransactionStatus.UNCLASSIFIED,
        source: TransactionSource.REVOLUT,
        merchant: 'Empresa SL',
        transactionDate: new Date(dto.date),
      });
      mockPrisma.importEvent.create.mockResolvedValue({});
      mockPrisma.integration.update.mockResolvedValue({});
      mockTx.account.update.mockResolvedValue({});

      const result = await service.importFromShortcut(userId, integrationId, accountId, dto);

      expect(result).toEqual({
        success: true,
        created: true,
        transactionId: 'new-transaction-id',
      });
      expect(mockTx.transaction.create).toHaveBeenCalled();
      
      // Verify importEvent was created with correct finalDecision
      const importEventCall = mockPrisma.importEvent.create.mock.calls[0][0];
      expect(importEventCall.data.finalDecision).toBe(FinalDecision.INCOME);
    });

    it('should not create transaction for N/A message', async () => {
      const dto: ShortcutImportDto = {
        message: 'Tu código de verificación es 123456',
        date: '2026-10-02T12:00:00Z',
      };

      mockPrisma.importEvent.findUnique.mockResolvedValue(null);
      mockPrisma.importEvent.create.mockResolvedValue({});
      mockPrisma.integration.update.mockResolvedValue({});

      const result = await service.importFromShortcut(userId, integrationId, accountId, dto);

      expect(result).toEqual({
        success: true,
        created: false,
        transactionId: undefined,
      });
      expect(mockTx.transaction.create).not.toHaveBeenCalled();
      
      // Verify importEvent was created with N/A finalDecision
      const importEventCall = mockPrisma.importEvent.create.mock.calls[0][0];
      expect(importEventCall.data.finalDecision).toBe(FinalDecision.NA);
      expect(importEventCall.data.transactionId).toBeUndefined();
    });

    it('should return duplicate for existing import', async () => {
      const dto: ShortcutImportDto = {
        message: 'Has enviado 15.90€ a Juan Pablo. Llegará en segundos',
        date: '2026-10-02T12:00:00Z',
      };

      const existingEvent = {
        id: 'import-event-id',
        transactionId: 'existing-transaction-id',
      };

      mockPrisma.importEvent.findUnique.mockResolvedValue(existingEvent);
      mockPrisma.integration.update.mockResolvedValue({});

      const result = await service.importFromShortcut(userId, integrationId, accountId, dto);

      expect(result).toEqual({
        success: true,
        created: false,
        duplicate: true,
        transactionId: 'existing-transaction-id',
      });
      expect(mockTx.transaction.create).not.toHaveBeenCalled();
    });

    it('should generate consistent fingerprint', async () => {
      const dto: ShortcutImportDto = {
        message: 'Has enviado 15.90€ a Juan Pablo. Llegará en segundos',
        date: '2026-10-02T12:00:00Z',
      };

      mockPrisma.importEvent.findUnique.mockResolvedValue(null);
      mockTx.transaction.create.mockResolvedValue({ id: 'tx-1' });
      mockPrisma.importEvent.create.mockResolvedValue({});
      mockPrisma.integration.update.mockResolvedValue({});
      mockTx.account.update.mockResolvedValue({});

      await service.importFromShortcut(userId, integrationId, accountId, dto);

      const fingerprintCall = mockPrisma.importEvent.create.mock.calls[0][0];
      expect(fingerprintCall.data.fingerprint).toBeDefined();
      expect(typeof fingerprintCall.data.fingerprint).toBe('string');
      expect(fingerprintCall.data.fingerprint.length).toBe(64);
    });
  });
});