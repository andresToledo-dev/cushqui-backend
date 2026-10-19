import { Test, TestingModule } from '@nestjs/testing';
import { ImportsService } from './imports.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShortcutImportDto } from './dto/shortcut-import.dto';
import { ManualImportDto } from './dto/manual-import.dto';
import { TransactionSource, TransactionType, TransactionStatus, FinalDecision, IntegrationType } from '@prisma/client';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
      findFirst: jest.fn(),
      findMany: jest.fn(),
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

  describe('importManual', () => {
    const manualIntegration = { id: integrationId, userId, type: IntegrationType.MANUAL };
    const account = {
      id: accountId,
      userId,
      name: 'Revolut',
      currency: 'USD',
      isActive: true,
    };

    beforeEach(() => {
      mockPrisma.importEvent.findUnique.mockResolvedValue(null);
      mockPrisma.importEvent.create.mockResolvedValue({});
      mockPrisma.integration.update.mockResolvedValue({});
      mockTx.transaction.create.mockResolvedValue({ id: 'manual-tx-id' });
      mockTx.account.update.mockResolvedValue({});
    });

    it('should create an EXPENSE transaction for an account given by id', async () => {
      mockPrisma.account.findFirst.mockResolvedValue(account);
      const dto: ManualImportDto = {
        type: TransactionType.EXPENSE,
        amount: 15.5,
        accountId,
        date: '2026-10-02T12:00:00Z',
        description: 'Cena',
      };

      const result = await service.importManual(manualIntegration, dto);

      expect(result).toEqual({ success: true, created: true, transactionId: 'manual-tx-id' });
      expect(mockPrisma.account.findFirst).toHaveBeenCalledWith({ where: { id: accountId, userId } });
      const txData = mockTx.transaction.create.mock.calls[0][0].data;
      expect(txData).toMatchObject({
        userId,
        accountId,
        currency: 'USD',
        type: TransactionType.EXPENSE,
        status: TransactionStatus.UNCLASSIFIED,
        source: TransactionSource.MANUAL,
        merchant: 'Cena',
        transactionDate: new Date(dto.date!),
      });
      expect(txData.amount).toEqual(new Decimal(15.5));
      expect(mockTx.account.update).toHaveBeenCalledWith({
        where: { id: accountId },
        data: { balance: { increment: new Decimal(-15.5) } },
      });
      const eventData = mockPrisma.importEvent.create.mock.calls[0][0].data;
      expect(eventData).toMatchObject({
        userId,
        integrationId,
        source: TransactionSource.MANUAL,
        finalDecision: FinalDecision.EXPENSE,
        transactionId: 'manual-tx-id',
      });
      expect(eventData.fingerprint).toHaveLength(64);
      expect(eventData.message).toContain('EXPENSE 15.50 USD');
      expect(mockPrisma.integration.update).toHaveBeenCalled();
    });

    it('should create an INCOME transaction for an account given by name (case-insensitive), dated now by default', async () => {
      mockPrisma.account.findMany.mockResolvedValue([account]);
      const before = Date.now();

      const result = await service.importManual(manualIntegration, {
        type: TransactionType.INCOME,
        amount: 100,
        accountName: ' revolut ',
      });

      expect(result.created).toBe(true);
      expect(mockPrisma.account.findMany).toHaveBeenCalledWith({
        where: { userId, isActive: true, name: { equals: 'revolut', mode: 'insensitive' } },
      });
      const txData = mockTx.transaction.create.mock.calls[0][0].data;
      expect(txData.type).toBe(TransactionType.INCOME);
      expect(txData.transactionDate.getTime()).toBeGreaterThanOrEqual(before);
      expect(mockTx.account.update).toHaveBeenCalledWith({
        where: { id: accountId },
        data: { balance: { increment: new Decimal(100) } },
      });
      expect(mockPrisma.importEvent.create.mock.calls[0][0].data.finalDecision).toBe(FinalDecision.INCOME);
    });

    it('should return duplicate when the same externalId is imported again', async () => {
      mockPrisma.account.findFirst.mockResolvedValue(account);
      mockPrisma.importEvent.findUnique.mockResolvedValue({ id: 'event-id', transactionId: 'existing-tx-id' });

      const result = await service.importManual(manualIntegration, {
        type: TransactionType.EXPENSE,
        amount: 10,
        accountId,
        date: '2026-10-02T12:00:00Z',
        externalId: 'ext-1',
      });

      expect(result).toEqual({ success: true, created: false, duplicate: true, transactionId: 'existing-tx-id' });
      expect(mockTx.transaction.create).not.toHaveBeenCalled();
      expect(mockTx.account.update).not.toHaveBeenCalled();
    });

    it('should repeat the fingerprint only for the same externalId', async () => {
      mockPrisma.account.findFirst.mockResolvedValue(account);
      const dto: ManualImportDto = { type: TransactionType.EXPENSE, amount: 10, accountId, date: '2026-10-02T12:00:00Z' };

      await service.importManual(manualIntegration, { ...dto, externalId: 'ext-1' });
      await service.importManual(manualIntegration, { ...dto, externalId: 'ext-1' });
      await service.importManual(manualIntegration, dto);
      await service.importManual(manualIntegration, dto);

      const [a, b, c, d] = mockPrisma.importEvent.findUnique.mock.calls.map((call) => call[0].where.fingerprint);
      expect(a).toBe(b);
      expect(c).not.toBe(d);
    });

    it('should reject a non-MANUAL integration token', async () => {
      await expect(
        service.importManual(
          { ...manualIntegration, type: IntegrationType.SHORTCUT },
          { type: TransactionType.EXPENSE, amount: 10, accountId },
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(mockTx.transaction.create).not.toHaveBeenCalled();
    });

    it.each([
      ['both accountId and accountName', { accountId, accountName: 'Revolut' }],
      ['neither accountId nor accountName', {}],
    ])('should reject %s', async (_label, accountFields) => {
      await expect(
        service.importManual(manualIntegration, { type: TransactionType.EXPENSE, amount: 10, ...accountFields }),
      ).rejects.toThrow(BadRequestException);
      expect(mockTx.transaction.create).not.toHaveBeenCalled();
    });

    it('should return 404 when the account does not exist or belongs to another user', async () => {
      mockPrisma.account.findFirst.mockResolvedValue(null);

      await expect(
        service.importManual(manualIntegration, { type: TransactionType.EXPENSE, amount: 10, accountId: 'other-account' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return 404 when no active account has that name', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);

      await expect(
        service.importManual(manualIntegration, { type: TransactionType.EXPENSE, amount: 10, accountName: 'Nope' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return 409 when several active accounts share the name', async () => {
      mockPrisma.account.findMany.mockResolvedValue([account, { ...account, id: 'other-id' }]);

      await expect(
        service.importManual(manualIntegration, { type: TransactionType.EXPENSE, amount: 10, accountName: 'Revolut' }),
      ).rejects.toThrow(ConflictException);
      expect(mockTx.transaction.create).not.toHaveBeenCalled();
    });

    it('should reject an inactive account', async () => {
      mockPrisma.account.findFirst.mockResolvedValue({ ...account, isActive: false });

      await expect(
        service.importManual(manualIntegration, { type: TransactionType.EXPENSE, amount: 10, accountId }),
      ).rejects.toThrow(BadRequestException);
      expect(mockTx.transaction.create).not.toHaveBeenCalled();
    });
  });
});