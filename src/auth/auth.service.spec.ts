import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { DEFAULT_CATEGORIES, lightenColor } from '../categories/default-categories';

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
    it('should create a new user and return tokens', async () => {
      const dto: RegisterDto = {
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User',
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-id',
        email: dto.email,
        passwordHash: 'hashed-password',
        name: dto.name,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockJwtService.sign.mockImplementation((payload, options) => {
        if (options?.expiresIn === '15m') return 'access-token';
        return 'refresh-token';
      });

      const result = await service.register(dto);

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: dto.email,
          passwordHash: 'hashed-password',
          name: dto.name,
        },
      });
    });

    it('should create the default categories for the new user in the same transaction', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      mockPrisma.user.create.mockResolvedValue({ id: 'user-id' });
      mockJwtService.sign.mockReturnValue('token');

      await service.register({ email: 'new@example.com', password: 'Password123!', name: 'New' });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
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
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      mockPrisma.user.create.mockResolvedValue({ id: 'user-id' });
      mockPrisma.category.createMany.mockRejectedValueOnce(new Error('db down'));

      await expect(service.register({ email: 'new@example.com', password: 'Password123!', name: 'New' })).rejects.toThrow('db down');
      expect(mockJwtService.sign).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if email already exists', async () => {
      const dto: RegisterDto = {
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User',
      };

      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing-id' });

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
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