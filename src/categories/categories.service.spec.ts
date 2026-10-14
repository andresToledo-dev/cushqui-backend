import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';

describe('CategoriesService', () => {
  let service: CategoriesService;

  const mockPrisma: any = {
    category: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    transaction: {
      count: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrisma)),
  };

  const userId = 'user-id';
  const categoryId = 'category-id';

  const buildCategory = (overrides: Record<string, unknown> = {}) => ({
    id: categoryId,
    userId,
    name: 'Prestamos',
    type: TransactionType.EXPENSE,
    icon: '💰',
    color: '#FF6B35',
    parentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CategoriesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a user category with its type', async () => {
      const dto: CreateCategoryDto = { name: 'Salario', type: TransactionType.INCOME, icon: '💼', color: '#1565C0' };
      mockPrisma.category.create.mockResolvedValue(buildCategory({ ...dto }));

      const result = await service.create(userId, dto);

      expect(mockPrisma.category.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId, name: 'Salario', type: TransactionType.INCOME }),
      });
      expect(result).toEqual(expect.objectContaining({ name: 'Salario', type: TransactionType.INCOME, userId }));
    });
  });

  describe('findAll', () => {
    it('should return global and user categories with their type', async () => {
      mockPrisma.category.findMany
        .mockResolvedValueOnce([buildCategory({ id: 'global-1', userId: null, name: 'Food', children: [] })])
        .mockResolvedValueOnce([buildCategory({ id: 'user-1', type: TransactionType.INCOME, children: [] })]);

      const result = await service.findAll(userId);

      expect(result).toHaveLength(2);
      expect(result.map((c) => c.type)).toEqual([TransactionType.EXPENSE, TransactionType.INCOME]);
    });
  });

  describe('update', () => {
    it('should change the type of an unused category and of its subcategories', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(buildCategory());
      mockPrisma.category.findMany.mockResolvedValue([{ id: 'sub-1' }, { id: 'sub-2' }]);
      mockPrisma.transaction.count.mockResolvedValue(0);
      mockPrisma.category.update.mockResolvedValue(buildCategory({ type: TransactionType.INCOME, children: [] }));

      const result = await service.update(userId, categoryId, { type: TransactionType.INCOME });

      expect(mockPrisma.transaction.count).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          OR: [{ categoryId: { in: [categoryId, 'sub-1', 'sub-2'] } }, { subcategoryId: { in: [categoryId, 'sub-1', 'sub-2'] } }],
        },
      });
      expect(mockPrisma.category.updateMany).toHaveBeenCalledWith({
        where: { parentId: categoryId },
        data: { type: TransactionType.INCOME },
      });
      expect(result.type).toBe(TransactionType.INCOME);
    });

    it('should reject changing the type of a category used by transactions', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(buildCategory());
      mockPrisma.category.findMany.mockResolvedValue([]);
      mockPrisma.transaction.count.mockResolvedValue(3);

      await expect(service.update(userId, categoryId, { type: TransactionType.INCOME })).rejects.toThrow(BadRequestException);
      expect(mockPrisma.category.update).not.toHaveBeenCalled();
    });

    it('should reject changing the type of a subcategory directly', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(buildCategory({ parentId: 'parent-id' }));

      await expect(service.update(userId, categoryId, { type: TransactionType.INCOME })).rejects.toThrow(BadRequestException);
      expect(mockPrisma.category.update).not.toHaveBeenCalled();
    });

    it('should not check transactions when the type does not change', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(buildCategory());
      mockPrisma.category.update.mockResolvedValue(buildCategory({ name: 'Préstamos', children: [] }));

      await service.update(userId, categoryId, { name: 'Préstamos', type: TransactionType.EXPENSE });

      expect(mockPrisma.transaction.count).not.toHaveBeenCalled();
      expect(mockPrisma.category.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('createSubcategory', () => {
    it('should use the color sent by the frontend and inherit type and icon from the parent', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(buildCategory());
      mockPrisma.category.create.mockImplementation(({ data }: any) => Promise.resolve({ ...buildCategory(), ...data, id: 'sub-id' }));

      const result = await service.createSubcategory(userId, { name: 'JP', parentCategoryId: categoryId, color: '#FF895D' });

      expect(mockPrisma.category.create).toHaveBeenCalledWith({
        data: {
          userId,
          name: 'JP',
          type: TransactionType.EXPENSE,
          icon: '💰',
          color: '#FF895D',
          parentId: categoryId,
        },
      });
      expect(result).toEqual(expect.objectContaining({ color: '#FF895D', type: TransactionType.EXPENSE, parentId: categoryId }));
    });
  });

  describe('delete', () => {
    it('should throw ForbiddenException for global category', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(buildCategory({ userId: null }));

      await expect(service.delete(userId, categoryId)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if category has transactions', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(buildCategory());
      mockPrisma.transaction.count.mockResolvedValue(5);

      await expect(service.delete(userId, categoryId)).rejects.toThrow(ForbiddenException);
    });
  });
});
