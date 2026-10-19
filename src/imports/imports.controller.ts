import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { IntegrationType } from '@prisma/client';
import { ImportsService } from './imports.service';
import { ShortcutImportDto } from './dto/shortcut-import.dto';
import { ManualImportDto } from './dto/manual-import.dto';
import { ImportResponseDto } from './dto/import-response.dto';
import { IntegrationToken } from '../common/decorators/integration-token.decorator';
import { IntegrationAuthGuard } from '../common/guards/integration-auth.guard';
import { Public } from '../common/decorators/public.decorator';

type AuthenticatedIntegration = { id: string; userId: string; accountId: string | null; type: IntegrationType };

@ApiTags('imports')
@Controller('imports')
export class ImportsController {
  constructor(private importsService: ImportsService) {}

  @Post('shortcut')
  @Public()
  @UseGuards(IntegrationAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Import transaction from iOS Shortcut' })
  @ApiResponse({ status: 200, type: ImportResponseDto })
  @ApiResponse({ status: 400, description: 'Integration not linked to an account' })
  @ApiResponse({ status: 401, description: 'Invalid integration token' })
  @ApiResponse({ status: 403, description: 'Token is not a SHORTCUT integration' })
  async importFromShortcut(
    @IntegrationToken() integration: AuthenticatedIntegration,
    @Body() dto: ShortcutImportDto,
  ): Promise<ImportResponseDto> {
    if (integration.type !== IntegrationType.SHORTCUT) {
      throw new ForbiddenException('Shortcut imports require a SHORTCUT integration token');
    }
    if (!integration.accountId) {
      throw new BadRequestException('Integration must be linked to an account');
    }

    return this.importsService.importFromShortcut(
      integration.userId,
      integration.id,
      integration.accountId,
      dto,
    );
  }

  @Post('manual')
  @Public()
  @UseGuards(IntegrationAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Import a transaction with explicit type, amount and account (MANUAL integration)' })
  @ApiResponse({ status: 200, type: ImportResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid body, both or neither accountId/accountName, or inactive account' })
  @ApiResponse({ status: 401, description: 'Invalid integration token' })
  @ApiResponse({ status: 403, description: 'Token is not a MANUAL integration' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  @ApiResponse({ status: 409, description: 'Several active accounts share that name' })
  async importManual(
    @IntegrationToken() integration: AuthenticatedIntegration,
    @Body() dto: ManualImportDto,
  ): Promise<ImportResponseDto> {
    return this.importsService.importManual(integration, dto);
  }
}
