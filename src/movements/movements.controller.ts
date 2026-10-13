import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { MovementsService } from './movements.service';
import { MovementQueryDto } from './dto/movement-query.dto';
import { MovementResponseDto } from './dto/movement-response.dto';
import { PaginatedResponseDto } from '../transactions/dto/paginated-response.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('movements')
@Controller('movements')
export class MovementsController {
  constructor(private movementsService: MovementsService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List account movements (openings, adjustments and transfers)' })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  async findAll(
    @CurrentUser('id') userId: string,
    @Query() query: MovementQueryDto,
  ): Promise<PaginatedResponseDto<MovementResponseDto>> {
    return this.movementsService.findAll(userId, query);
  }
}
