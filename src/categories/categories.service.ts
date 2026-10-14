import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";
import { CreateSubcategoryDto, UpdateSubcategoryDto } from "./dto/subcategory.dto";
import { CategoryResponseDto } from "./dto/category-response.dto";
import { TransactionType } from "@prisma/client";

type CategoryRow = {
  id: string;
  name: string;
  type: TransactionType;
  icon: string | null;
  color: string | null;
  userId: string | null;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    const category = await this.prisma.category.create({
      data: {
        userId,
        name: dto.name,
        type: dto.type,
        icon: dto.icon,
        color: dto.color,
      },
    });

    return this.toResponseDto(category);
  }

  async findAll(userId: string): Promise<CategoryResponseDto[]> {
    // Get global top-level categories (userId: null, parentId: null)
    // Include subcategories that belong to system (userId: null) OR current user
    const globalCategories = await this.prisma.category.findMany({
      where: { userId: null, parentId: null },
      include: {
        children: {
          where: {
            OR: [{ userId: null }, { userId }],
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });

    // Get user top-level categories (userId: currentUserId, parentId: null)
    // Include their subcategories (which will have same userId)
    const userCategories = await this.prisma.category.findMany({
      where: { userId, parentId: null },
      include: {
        children: {
          where: { userId },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });

    return [...globalCategories.map((c) => this.toResponseDto(c)), ...userCategories.map((c) => this.toResponseDto(c))];
  }

  async findById(userId: string, id: string): Promise<CategoryResponseDto> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { children: true },
    });

    if (!category) {
      throw new NotFoundException("Category not found");
    }

    if (category.userId && category.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    return this.toResponseDto(category);
  }

  async update(userId: string, id: string, dto: UpdateCategoryDto): Promise<CategoryResponseDto> {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException("Category not found");
    }

    if (category.userId !== userId) {
      throw new ForbiddenException("Cannot modify global categories");
    }

    const typeChanged = dto.type !== undefined && dto.type !== category.type;
    if (typeChanged) {
      if (category.parentId) {
        throw new BadRequestException("A subcategory always has the type of its parent: change the parent category instead");
      }
      // Transactions must keep matching their category type
      const children = await this.prisma.category.findMany({ where: { parentId: id }, select: { id: true } });
      const ids = [id, ...children.map((c) => c.id)];
      const used = await this.prisma.transaction.count({
        where: { deletedAt: null, OR: [{ categoryId: { in: ids } }, { subcategoryId: { in: ids } }] },
      });
      if (used > 0) {
        throw new BadRequestException(`Cannot change the type of a category used by ${used} transactions`);
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (typeChanged) {
        // Subcategories follow their parent
        await tx.category.updateMany({ where: { parentId: id }, data: { type: dto.type } });
      }
      return tx.category.update({
        where: { id },
        data: {
          name: dto.name,
          type: dto.type,
          icon: dto.icon,
          color: dto.color,
        },
        include: { children: true },
      });
    });

    return this.toResponseDto(updated);
  }

  async delete(userId: string, id: string): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException("Category not found");
    }

    if (category.userId !== userId) {
      throw new ForbiddenException("Cannot delete global categories");
    }

    const transactionCount = await this.prisma.transaction.count({
      where: { categoryId: id },
    });

    if (transactionCount > 0) {
      throw new ForbiddenException("Cannot delete category with associated transactions");
    }

    const childrenCount = await this.prisma.category.count({
      where: { parentId: id },
    });

    if (childrenCount > 0) {
      throw new ForbiddenException("Cannot delete category with subcategories");
    }

    await this.prisma.category.delete({ where: { id } });
  }

  // Subcategory methods
  async createSubcategory(userId: string, dto: CreateSubcategoryDto): Promise<CategoryResponseDto> {
    // Validate parent category exists
    const parentCategory = await this.prisma.category.findUnique({
      where: { id: dto.parentCategoryId },
    });

    if (!parentCategory) {
      throw new NotFoundException("Parent category not found");
    }

    // Verify parent is a top-level category (no parentId)
    if (parentCategory.parentId) {
      throw new BadRequestException("Only top-level categories can have subcategories (max 2 levels)");
    }

    // Verify user has access to parent category
    if (parentCategory.userId && parentCategory.userId !== userId) {
      throw new ForbiddenException("Access denied to parent category");
    }

    // Same icon and type as the parent; the color comes from the frontend
    const subcategory = await this.prisma.category.create({
      data: {
        userId: userId,
        name: dto.name,
        type: parentCategory.type,
        icon: parentCategory.icon,
        color: dto.color,
        parentId: dto.parentCategoryId,
      },
    });

    return this.toResponseDto(subcategory);
  }

  async updateSubcategory(userId: string, id: string, dto: UpdateSubcategoryDto): Promise<CategoryResponseDto> {
    const subcategory = await this.prisma.category.findUnique({
      where: { id },
      include: { parent: true },
    });

    if (!subcategory) {
      throw new NotFoundException("Subcategory not found");
    }

    // Verify it's a subcategory (has parentId)
    if (!subcategory.parentId) {
      throw new BadRequestException("This endpoint is only for subcategories");
    }

    // Verify user has access
    if (subcategory.userId && subcategory.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    // Only allow updating name
    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
      },
      include: { parent: true },
    });

    return this.toResponseDto(updated);
  }

  async getSubcategoriesByCategory(userId: string, categoryId: string): Promise<CategoryResponseDto[]> {
    // Validate parent category exists
    const parentCategory = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!parentCategory) {
      throw new NotFoundException("Parent category not found");
    }

    // Verify user has access
    if (parentCategory.userId && parentCategory.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    const subcategories = await this.prisma.category.findMany({
      where: { parentId: categoryId },
      orderBy: { createdAt: "asc" },
    });

    return subcategories.map((s) =>
      this.toResponseDto({
        ...s,
        parentId: s.parentId,
      }),
    );
  }

  private toResponseDto(category: CategoryRow & { children?: CategoryRow[] }): CategoryResponseDto {
    return new CategoryResponseDto({
      id: category.id,
      name: category.name,
      type: category.type,
      icon: category.icon ?? undefined,
      color: category.color ?? undefined,
      userId: category.userId,
      parentId: category.parentId,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      subcategories: category.children?.map((s) => this.toResponseDto(s)) ?? [],
    });
  }
}
