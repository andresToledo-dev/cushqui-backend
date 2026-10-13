import { IsString, IsUUID, IsNumber, IsEnum, IsOptional, IsDateString, Min, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TransactionType, TransactionSource } from '@prisma/client';

export class CreateTransactionDto {
  @ApiProperty({ example: 'revolut-account' })
  @IsString()
  accountId: string;

  @ApiProperty({ example: 25.5 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.01)
  amount: number;

  @ApiProperty({ example: 'EUR', required: false })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string = 'EUR';

  @ApiProperty({ enum: TransactionType, example: TransactionType.EXPENSE })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiProperty({ example: 'Continente', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  merchant?: string;

  @ApiProperty({ example: 'Compra semanal', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: 'cat-loans', required: false })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({ example: '8e06b53d-d31d-41fc-bb31-f86cac468307', required: false })
  @IsOptional()
  @IsString()
  subcategoryId?: string;

  @ApiProperty({ example: '2026-10-02T12:00:00Z' })
  @IsDateString()
  transactionDate: string;

  @ApiProperty({ enum: TransactionSource, example: TransactionSource.MANUAL, required: false })
  @IsOptional()
  @IsEnum(TransactionSource)
  source?: TransactionSource = TransactionSource.MANUAL;
}