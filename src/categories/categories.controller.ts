import { Controller, Get, Post, Patch, Delete, Param, Body, HttpStatus, HttpCode } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from "@nestjs/swagger";
import { CategoriesService } from "./categories.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";
import { CreateSubcategoryDto, UpdateSubcategoryDto } from "./dto/subcategory.dto";
import { CategoryResponseDto } from "./dto/category-response.dto";
import { CurrentUser } from "../common/decorators/current-user.decorator";

@ApiTags("categories")
@Controller("categories")
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a new category" })
  @ApiResponse({ status: 201, type: CategoryResponseDto })
  async create(@CurrentUser("id") userId: string, @Body() dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    return this.categoriesService.create(userId, dto);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: "List the user's categories with their subcategories" })
  @ApiResponse({ status: 200, type: [CategoryResponseDto] })
  async findAll(@CurrentUser("id") userId: string): Promise<CategoryResponseDto[]> {
    return this.categoriesService.findAll(userId);
  }

  @Get(":id")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get category by ID" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 200, type: CategoryResponseDto })
  @ApiResponse({ status: 404, description: "Category not found" })
  async findById(@CurrentUser("id") userId: string, @Param("id") id: string): Promise<CategoryResponseDto> {
    return this.categoriesService.findById(userId, id);
  }

  @Patch(":id")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update category" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 200, type: CategoryResponseDto })
  @ApiResponse({ status: 404, description: "Category not found" })
  @ApiResponse({ status: 403, description: "Category of another user" })
  async update(@CurrentUser("id") userId: string, @Param("id") id: string, @Body() dto: UpdateCategoryDto): Promise<CategoryResponseDto> {
    return this.categoriesService.update(userId, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Delete category" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 204, description: "Category deleted" })
  @ApiResponse({ status: 404, description: "Category not found" })
  @ApiResponse({ status: 403, description: "Category of another user, with transactions or with subcategories" })
  async delete(@CurrentUser("id") userId: string, @Param("id") id: string): Promise<void> {
    return this.categoriesService.delete(userId, id);
  }

  // Subcategory endpoints
  @Post("subcategories")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a new subcategory" })
  @ApiResponse({ status: 201, type: CategoryResponseDto })
  @ApiResponse({ status: 400, description: "Invalid parent category or max depth reached" })
  @ApiResponse({ status: 404, description: "Parent category not found" })
  async createSubcategory(@CurrentUser("id") userId: string, @Body() dto: CreateSubcategoryDto): Promise<CategoryResponseDto> {
    return this.categoriesService.createSubcategory(userId, dto);
  }

  @Get(":id/subcategories")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get all subcategories of a category" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 200, type: [CategoryResponseDto] })
  @ApiResponse({ status: 404, description: "Category not found" })
  async getSubcategories(@CurrentUser("id") userId: string, @Param("id") id: string): Promise<CategoryResponseDto[]> {
    return this.categoriesService.getSubcategoriesByCategory(userId, id);
  }

  @Patch("subcategories/:id")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update subcategory name" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 200, type: CategoryResponseDto })
  @ApiResponse({ status: 404, description: "Subcategory not found" })
  @ApiResponse({ status: 400, description: "Not a subcategory" })
  async updateSubcategory(@CurrentUser("id") userId: string, @Param("id") id: string, @Body() dto: UpdateSubcategoryDto): Promise<CategoryResponseDto> {
    return this.categoriesService.updateSubcategory(userId, id, dto);
  }
}
