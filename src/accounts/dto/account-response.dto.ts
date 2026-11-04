import { ApiProperty } from '@nestjs/swagger';
import { AccountType } from '@prisma/client';
import { Exclude, Expose, Transform } from 'class-transformer';

export class AccountResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Revolut' })
  name: string;

  @ApiProperty({ enum: AccountType, example: AccountType.BANK })
  type: AccountType;

  @ApiProperty({ example: 'EUR' })
  currency: string;

  @ApiProperty({ example: 1000.0 })
  @Expose()
  @Transform(({ value }) => parseFloat(value.toString()))
  balance: number;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: true, description: 'Show the account in the accounts list' })
  visibleInList: boolean;

  @ApiProperty({ example: true, description: 'Show the balance of the account' })
  balanceVisible: boolean;

  @ApiProperty({ example: '🏠', required: false })
  icon?: string;

  @ApiProperty({ example: '#FFD700', required: false })
  color?: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt: Date;

  constructor(partial: Partial<AccountResponseDto>) {
    Object.assign(this, partial);
  }
}