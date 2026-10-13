import { Controller, Post, Patch, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { TransfersService } from './transfers.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { UpdateTransferDto } from './dto/update-transfer.dto';
import { TransferResponseDto } from './dto/transfer-response.dto';
import { MovementResponseDto } from '../movements/dto/movement-response.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('transfers')
@Controller('transfers')
export class TransfersController {
  constructor(private transfersService: TransfersService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a transfer between accounts' })
  @ApiResponse({ status: 201, type: TransferResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid transfer data' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTransferDto,
  ): Promise<TransferResponseDto> {
    return this.transfersService.create(userId, dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Edit a transfer (balances are re-applied, the edit itself is not recorded)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: MovementResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid transfer data' })
  @ApiResponse({ status: 404, description: 'Transfer or account not found' })
  async update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTransferDto,
  ): Promise<MovementResponseDto> {
    return this.transfersService.update(userId, id, dto);
  }
}
