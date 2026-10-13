import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: PrismaService;

  const mockPrisma = {
    category: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    transaction: {
      count: jest.fn(),
    },
    subcategory: {
      findMany: jest.fn(),
    },
  };

  const userId = 'user-id';
  const categoryId = 'category-id';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a user category', async () => {
      const dto: CreateCategoryDto = {
        name: 'My Category',
        icon: '🎯',
        color: '#FF0000',
      };

      const created = {
        id: categoryId,
        userId,
        ...dto,
        createdAt: new Date(),
        updatedAt: new Date(),
        subcategories: [],
      };

      mockPrisma.category.create.mockResolvedValue(created);

      const result = await service.create(userId, dto);

      expect(result).toEqual(
        expect.objectContaining({
          id: categoryId,
          name: dto.name,
          userId,
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should return global and user categories', async () => {
      const globalCategories = [
        { id: 'global-1', userId: null, name: 'Food', icon: '🍔', color: '#FF0000', createdAt: new Date(), updatedAt: new Date(), subcategories: [] },
      ];
      const userCategories = [
        { id: 'user-1', userId, name: 'My Category', icon: '🎯', color: '#FF0000', createdAt: new Date(), updatedAt: new Date(), subcategories: [] },
      ];

      mockPrisma.category.findMany
        .mockResolvedValueOnce(globalCategories)
        .mockResolvedValueOnce(userCategories);

      const result = await service.findAll(userId);

      expect(result).toHaveLength(2);
    });
  });

  describe('delete', () => {
    it('should throw ForbiddenException for global category', async () => {
      const category = { id: categoryId, userId: null, name: 'Food' };

      mockPrisma.category.findUnique.mockResolvedValue(category);

      await expect(service.delete(userId, categoryId)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if category has transactions', async () => {
      const category = { id: categoryId, userId, name: 'My Category' };

      mockPrisma.category.findUnique.mockResolvedValue(category);
      mockPrisma.transaction.count.mockResolvedValue(5);

      await expect(service.delete(userId, categoryId)).rejects.toThrow(ForbiddenException);
    });
  });
});