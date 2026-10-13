import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { AdjustBalanceDto } from './dto/adjust-balance.dto';
import { AccountResponseDto } from './dto/account-response.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(private accountsService: AccountsService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new account' })
  @ApiResponse({ status: 201, type: AccountResponseDto })
  async create(@CurrentUser('id') userId: string, @Body() dto: CreateAccountDto): Promise<AccountResponseDto> {
    return this.accountsService.create(userId, dto);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all accounts' })
  @ApiResponse({ status: 200, type: [AccountResponseDto] })
  async findAll(@CurrentUser('id') userId: string): Promise<AccountResponseDto[]> {
    return this.accountsService.findAll(userId);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get account by ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: AccountResponseDto })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async findById(@CurrentUser('id') userId: string, @Param('id') id: string): Promise<AccountResponseDto> {
    return this.accountsService.findById(userId, id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update account' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: AccountResponseDto })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ): Promise<AccountResponseDto> {
    return this.accountsService.update(userId, id, dto);
  }

  @Post(':id/adjustments')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Adjust the account balance to a new value (recorded as an ADJUSTMENT movement)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 201, type: AccountResponseDto })
  @ApiResponse({ status: 404, description: 'Account not found' })
  @ApiResponse({ status: 409, description: 'Balance changed concurrently' })
  async adjust(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: AdjustBalanceDto,
  ): Promise<AccountResponseDto> {
    return this.accountsService.adjust(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete account (soft delete if has transactions)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Account deleted' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async delete(@CurrentUser('id') userId: string, @Param('id') id: string): Promise<void> {
    return this.accountsService.delete(userId, id);
  }

  @Get(':id/balance')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get account balance' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, schema: { example: { balance: 1500.5 } } })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async getBalance(@CurrentUser('id') userId: string, @Param('id') id: string): Promise<{ balance: number }> {
    return this.accountsService.getBalance(userId, id);
  }
}