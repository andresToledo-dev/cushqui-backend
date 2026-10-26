import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { InvitationsService } from './invitations.service';
import { PrismaService } from '../prisma/prisma.service';
import { hashInvitationCode } from './invitation-code.util';

describe('InvitationsService', () => {
  let service: InvitationsService;

  const DAY = 24 * 60 * 60 * 1000;
  const mockPrisma = {
    invitation: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const row = (overrides: Record<string, unknown> = {}) => ({
    id: 'invitation-id',
    codeHash: 'hash',
    email: null,
    role: UserRole.USER,
    expiresAt: new Date(Date.now() + DAY),
    usedAt: null,
    usedById: null,
    revokedAt: null,
    createdById: 'admin-id',
    createdAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [InvitationsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(InvitationsService);
  });

  describe('create', () => {
    it('should store only the hash and return the code once, for a USER, expiring in 7 days', async () => {
      mockPrisma.invitation.create.mockImplementation(({ data }) => Promise.resolve(row(data)));

      const result = await service.create('admin-id', {});

      const { data } = mockPrisma.invitation.create.mock.calls[0][0];
      expect(result.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(data.codeHash).toBe(hashInvitationCode(result.code!));
      expect(data).not.toHaveProperty('code');
      expect(data).toMatchObject({ role: UserRole.USER, createdById: 'admin-id', email: undefined });
      expect(Math.round((data.expiresAt.getTime() - Date.now()) / DAY)).toBe(7);
      expect(result.status).toBe('PENDING');
    });

    it('should normalize the email and honour expiresInDays', async () => {
      mockPrisma.invitation.create.mockImplementation(({ data }) => Promise.resolve(row(data)));

      const result = await service.create('admin-id', { email: ' Friend@Example.com ', expiresInDays: 2 });

      const { data } = mockPrisma.invitation.create.mock.calls[0][0];
      expect(data.email).toBe('friend@example.com');
      expect(Math.round((data.expiresAt.getTime() - Date.now()) / DAY)).toBe(2);
      expect(result.email).toBe('friend@example.com');
    });
  });

  describe('findAll', () => {
    it('should list every invitation with its status and who used it, never the code', async () => {
      mockPrisma.invitation.findMany.mockResolvedValue([
        row({ id: 'pending' }),
        row({ id: 'used', usedAt: new Date(), usedById: 'u1', usedBy: { email: 'friend@example.com' } }),
        row({ id: 'expired', expiresAt: new Date(Date.now() - DAY) }),
        row({ id: 'revoked', revokedAt: new Date() }),
      ]);

      const result = await service.findAll();

      expect(result.map((i) => [i.id, i.status])).toEqual([
        ['pending', 'PENDING'],
        ['used', 'USED'],
        ['expired', 'EXPIRED'],
        ['revoked', 'REVOKED'],
      ]);
      expect(result[1].usedByEmail).toBe('friend@example.com');
      expect(result.every((i) => i.code === undefined)).toBe(true);
    });
  });

  describe('revoke', () => {
    it('should revoke a pending invitation', async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue(row());
      mockPrisma.invitation.update.mockResolvedValue(row({ revokedAt: new Date() }));

      const result = await service.revoke('invitation-id');

      expect(mockPrisma.invitation.update).toHaveBeenCalledWith({
        where: { id: 'invitation-id' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(result.status).toBe('REVOKED');
    });

    it('should reject a used invitation with 409', async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue(row({ usedAt: new Date() }));

      await expect(service.revoke('invitation-id')).rejects.toThrow(ConflictException);
      expect(mockPrisma.invitation.update).not.toHaveBeenCalled();
    });

    it('should return 404 for an unknown invitation', async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue(null);

      await expect(service.revoke('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
