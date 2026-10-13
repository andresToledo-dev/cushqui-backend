import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";
import { CreateSubcategoryDto, UpdateSubcategoryDto } from "./dto/subcategory.dto";
import { CategoryResponseDto } from "./dto/category-response.dto";
import { getNextSubcategoryColor } from "./utils/color.utils";

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    const category = await this.prisma.category.create({
      data: {
        userId,
        name: dto.name,
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

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        icon: dto.icon,
        color: dto.color,
      },
      include: { children: true },
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
      include: { children: true },
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

    // Get existing subcategories to calculate color
    const existingSubcategories = parentCategory.children;

    // Calculate color: use parent's icon, lighten parent color or last sibling color
    const color = getNextSubcategoryColor(parentCategory.color, existingSubcategories);

    // Create subcategory with same icon as parent, calculated color, and parentCategoryId
    const subcategory = await this.prisma.category.create({
      data: {
        userId: userId, // Same user as parent (null for global)
        name: dto.name,
        icon: parentCategory.icon, // Inherit parent's icon
        color,
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

  private toResponseDto(category: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
    userId: string | null;
    parentId: string | null;
    createdAt: Date;
    updatedAt: Date;
    children?: Array<{ id: string; name: string; icon: string | null; color: string | null; userId: string | null; parentId: string | null; createdAt: Date; updatedAt: Date }>;
  }): CategoryResponseDto {
    return new CategoryResponseDto({
      id: category.id,
      name: category.name,
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
