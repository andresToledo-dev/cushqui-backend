import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { StatisticsService } from './statistics.service';
import { StatisticsQueryDto } from './dto/statistics-query.dto';
import { CategoryStatDto, AccountStatDto, MonthlyStatDto } from './dto/statistics-response.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('statistics')
@Controller('statistics')
export class StatisticsController {
  constructor(private statisticsService: StatisticsService) {}

  @Get('categories')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get expenses by category' })
  @ApiResponse({ status: 200, type: [CategoryStatDto] })
  async getCategoriesStats(
    @CurrentUser('id') userId: string,
    @Query() query: StatisticsQueryDto,
  ): Promise<CategoryStatDto[]> {
    return this.statisticsService.getCategoriesStats(userId, query);
  }

  @Get('accounts')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get stats by account' })
  @ApiResponse({ status: 200, type: [AccountStatDto] })
  async getAccountsStats(
    @CurrentUser('id') userId: string,
    @Query() query: StatisticsQueryDto,
  ): Promise<AccountStatDto[]> {
    return this.statisticsService.getAccountsStats(userId, query);
  }

  @Get('monthly')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get monthly stats for last 12 months' })
  @ApiResponse({ status: 200, type: [MonthlyStatDto] })
  async getMonthlyStats(
    @CurrentUser('id') userId: string,
    @Query() query: StatisticsQueryDto,
  ): Promise<MonthlyStatDto[]> {
    return this.statisticsService.getMonthlyStats(userId, query);
  }
}