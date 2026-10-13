import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { IntegrationsService } from './integrations.service';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { IntegrationResponseDto } from './dto/integration-response.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsController {
  constructor(private integrationsService: IntegrationsService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new integration' })
  @ApiResponse({ status: 201, type: IntegrationResponseDto })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateIntegrationDto,
  ): Promise<IntegrationResponseDto> {
    return this.integrationsService.create(userId, dto);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all integrations' })
  @ApiResponse({ status: 200, type: [IntegrationResponseDto] })
  async findAll(@CurrentUser('id') userId: string): Promise<IntegrationResponseDto[]> {
    return this.integrationsService.findAll(userId);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get integration by ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: IntegrationResponseDto })
  @ApiResponse({ status: 404, description: 'Integration not found' })
  async findById(@CurrentUser('id') userId: string, @Param('id') id: string): Promise<IntegrationResponseDto> {
    return this.integrationsService.findById(userId, id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update integration' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: IntegrationResponseDto })
  @ApiResponse({ status: 404, description: 'Integration not found' })
  async update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: { name?: string; isActive?: boolean; accountId?: string | null },
  ): Promise<IntegrationResponseDto> {
    return this.integrationsService.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete integration' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Integration deleted' })
  @ApiResponse({ status: 404, description: 'Integration not found' })
  async delete(@CurrentUser('id') userId: string, @Param('id') id: string): Promise<void> {
    return this.integrationsService.delete(userId, id);
  }

  @Post(':id/regenerate-token')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Regenerate integration token' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: IntegrationResponseDto })
  @ApiResponse({ status: 404, description: 'Integration not found' })
  async regenerateToken(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<IntegrationResponseDto> {
    return this.integrationsService.regenerateToken(userId, id);
  }
}