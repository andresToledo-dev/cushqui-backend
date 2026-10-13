import { ApiProperty } from '@nestjs/swagger';

export class CategoryStatDto {
  @ApiProperty({ example: 'Alimentación' })
  category: string;

  @ApiProperty({ example: 320.5 })
  amount: number;

  @ApiProperty({ example: 42.3 })
  percentage: number;
}

export class AccountStatDto {
  @ApiProperty({ example: 'Revolut' })
  account: string;

  @ApiProperty({ example: 1500.0 })
  income: number;

  @ApiProperty({ example: 800.0 })
  expenses: number;

  @ApiProperty({ example: 700.0 })
  balance: number;
}

export class MonthlyStatDto {
  @ApiProperty({ example: '2026-10' })
  month: string;

  @ApiProperty({ example: 1800.0 })
  income: number;

  @ApiProperty({ example: 850.0 })
  expenses: number;

  @ApiProperty({ example: 950.0 })
  net: number;
}