import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { DEFAULT_CATEGORIES, lightenColor } from '../categories/default-categories';
import { hashInvitationCode } from '../invitations/invitation-code.util';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;

  const mockPrisma: any = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    category: {
      createMany: jest.fn(),
    },
    invitation: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    // Register runs inside a transaction: the callback receives the same mock
    $transaction: jest.fn((callback) => callback(mockPrisma)),
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        JWT_SECRET: 'test-secret',
        JWT_REFRESH_SECRET: 'test-refresh-secret',
        JWT_EXPIRES_IN: '15m',
        JWT_REFRESH_EXPIRES_IN: '7d',
      };
      return values[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);

    jest.clearAllMocks();
  });

  describe('register', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const code = 'K7QF-M2XH-9RTB';
    const baseDto: RegisterDto = { email: 'new@example.com', password: 'Password123!', name: 'New', invitationCode: code };
    const pendingInvitation = (overrides: Record<string, unknown> = {}) => ({
      id: 'invitation-id',
      codeHash: hashInvitationCode(code),
      email: null,
      role: UserRole.USER,
      expiresAt: new Date(Date.now() + DAY),
      usedAt: null,
      usedById: null,
      revokedAt: null,
      ...overrides,
    });

    beforeEach(() => {
      mockPrisma.invitation.findUnique.mockResolvedValue(pendingInvitation());
      mockPrisma.invitation.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      mockPrisma.user.create.mockResolvedValue({ id: 'user-id' });
      mockJwtService.sign.mockImplementation((payload, options) => (options?.expiresIn === '15m' ? 'access-token' : 'refresh-token'));
    });

    it('should create a new user with a valid invitation and return tokens', async () => {
      const result = await service.register(baseDto);

      expect(result).toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' });
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: { email: baseDto.email, passwordHash: 'hashed-password', name: baseDto.name, role: UserRole.USER },
      });
    });

    it('should look the code up by its hash, ignoring case and dashes', async () => {
      await service.register({ ...baseDto, invitationCode: 'k7qfm2xh9rtb' });

      expect(mockPrisma.invitation.findUnique).toHaveBeenCalledWith({ where: { codeHash: hashInvitationCode(code) } });
      expect(mockPrisma.user.create).toHaveBeenCalled();
    });

    it('should consume the invitation in the same transaction, only if still unused', async () => {
      await service.register(baseDto);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.invitation.updateMany).toHaveBeenCalledWith({
        where: { id: 'invitation-id', usedAt: null, revokedAt: null, expiresAt: { gt: expect.any(Date) } },
        data: { usedAt: expect.any(Date), usedById: 'user-id' },
      });
    });

    it('should give the user the role of the invitation', async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue(pendingInvitation({ role: UserRole.ADMIN }));

      await service.register(baseDto);

      expect(mockPrisma.user.create.mock.calls[0][0].data.role).toBe(UserRole.ADMIN);
    });

    it('should accept an invitation issued for the same email, case-insensitively', async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue(pendingInvitation({ email: 'new@example.com' }));

      await service.register({ ...baseDto, email: 'New@Example.com' });

      expect(mockPrisma.user.create).toHaveBeenCalled();
    });

    it.each([
      ['does not exist', null],
      ['was already used', pendingInvitation({ usedAt: new Date(), usedById: 'other-user' })],
      ['was revoked', pendingInvitation({ revokedAt: new Date() })],
      ['has expired', pendingInvitation({ expiresAt: new Date(Date.now() - 1000) })],
      ['was issued for another email', pendingInvitation({ email: 'someone@example.com' })],
    ])('should reject with 400 when the code %s, before checking the email', async (_case, invitation) => {
      mockPrisma.invitation.findUnique.mockResolvedValue(invitation);

      await expect(service.register(baseDto)).rejects.toThrow(new BadRequestException('Invalid or expired invitation code'));
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('should roll back when a parallel registration consumed the code first', async () => {
      mockPrisma.invitation.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.register(baseDto)).rejects.toThrow(BadRequestException);
      expect(mockJwtService.sign).not.toHaveBeenCalled();
    });

    it('should create the default categories for the new user in the same transaction', async () => {
      await service.register(baseDto);

      const [[{ data: parents }], [{ data: children }]] = mockPrisma.category.createMany.mock.calls;

      const expenses = Object.keys(DEFAULT_CATEGORIES.EXPENSE);
      const incomes = Object.keys(DEFAULT_CATEGORIES.INCOME);
      expect(parents).toHaveLength(expenses.length + incomes.length);
      expect(parents.every((c: any) => c.userId === 'user-id' && !c.parentId)).toBe(true);
      expect(parents.filter((c: any) => c.type === 'EXPENSE').map((c: any) => c.name)).toEqual(expenses);
      expect(parents.filter((c: any) => c.type === 'INCOME').map((c: any) => c.name)).toEqual(incomes);
      expect(parents.find((c: any) => c.name === 'Café')).toMatchObject({ icon: '☕', color: '#6D4C41' });

      // Prestamos subcategories: same user, type and icon as the parent, lighter colors
      const prestamos = parents.find((c: any) => c.name === 'Prestamos');
      expect(children.map((c: any) => c.name)).toEqual(['Persona 1', 'Persona 2']);
      for (const child of children) {
        expect(child).toMatchObject({ userId: 'user-id', parentId: prestamos.id, type: 'EXPENSE', icon: '💰' });
        expect(child.color).toMatch(/^#[0-9a-f]{6}$/);
      }
      expect(children[0].color).toBe(lightenColor('#FF6B35', 20));
      expect(children[1].color).toBe(lightenColor(children[0].color, 15));
    });

    it('should not create the user if the default categories fail', async () => {
      mockPrisma.category.createMany.mockRejectedValueOnce(new Error('db down'));

      await expect(service.register(baseDto)).rejects.toThrow('db down');
      expect(mockPrisma.invitation.updateMany).not.toHaveBeenCalled();
      expect(mockJwtService.sign).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing-id' });

      await expect(service.register(baseDto)).rejects.toThrow(ConflictException);
      expect(mockPrisma.invitation.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should return tokens for valid credentials', async () => {
      const dto: LoginDto = {
        email: 'test@example.com',
        password: 'Password123!',
      };

      const user = {
        id: 'user-id',
        email: dto.email,
        passwordHash: 'hashed-password',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign.mockImplementation((payload, options) => {
        if (options?.expiresIn === '15m') return 'access-token';
        return 'refresh-token';
      });

      const result = await service.login(dto);

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });

    it('should throw UnauthorizedException for invalid email', async () => {
      const dto: LoginDto = {
        email: 'test@example.com',
        password: 'Password123!',
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      const dto: LoginDto = {
        email: 'test@example.com',
        password: 'WrongPassword123!',
      };

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-id',
        email: dto.email,
        passwordHash: 'hashed-password',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshTokens', () => {
    it('should return new tokens for valid refresh token', async () => {
      const dto = { refreshToken: 'valid-refresh-token' };
      const user = { id: 'user-id' };

      mockJwtService.verify.mockReturnValue({ sub: 'user-id' });
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockJwtService.sign.mockImplementation((payload, options) => {
        if (options?.expiresIn === '15m') return 'new-access-token';
        return 'new-refresh-token';
      });

      const result = await service.refreshTokens(dto);

      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });
    });

    it('should throw UnauthorizedException for invalid refresh token', async () => {
      const dto = { refreshToken: 'invalid-refresh-token' };

      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.refreshTokens(dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getMe', () => {
    it('should return user with correct fields', async () => {
      const user = {
        id: 'user-id',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);

      const result = await service.getMe('user-id');

      expect(result.id).toBe('user-id');
      expect(result.email).toBe('test@example.com');
      expect(result.name).toBe('Test User');
      expect(result.createdAt).toEqual(user.createdAt);
      expect(result.updatedAt).toEqual(user.updatedAt);
      // passwordHash is present on instance but excluded during serialization via @Exclude()
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe('non-existent')).rejects.toThrow(UnauthorizedException);
    });
  });
});