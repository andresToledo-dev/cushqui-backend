import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ImportsService } from './imports.service';
import { ShortcutImportDto } from './dto/shortcut-import.dto';
import { ImportResponseDto } from './dto/import-response.dto';
import { IntegrationToken } from '../common/decorators/integration-token.decorator';
import { IntegrationAuthGuard } from '../common/guards/integration-auth.guard';
import { Public } from '../common/decorators/public.decorator';

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
  @ApiResponse({ status: 401, description: 'Invalid integration token' })
  async importFromShortcut(
    @IntegrationToken() integration: { id: string; userId: string; accountId: string | null },
    @Body() dto: ShortcutImportDto,
  ): Promise<ImportResponseDto> {
    if (!integration.accountId) {
      throw new Error('Integration must be linked to an account');
    }

    return this.importsService.importFromShortcut(
      integration.userId,
      integration.id,
      integration.accountId,
      dto,
    );
  }
}