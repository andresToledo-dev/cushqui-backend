import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { DashboardResponseDto } from './dto/dashboard-response.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get dashboard summary' })
  @ApiResponse({ status: 200, type: DashboardResponseDto })
  async getDashboard(@CurrentUser('id') userId: string): Promise<DashboardResponseDto> {
    return this.dashboardService.getDashboard(userId);
  }
}