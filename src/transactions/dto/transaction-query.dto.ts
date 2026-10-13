import { IsOptional, IsUUID, IsEnum, IsDateString, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TransactionType, TransactionStatus, TransactionSource } from '@prisma/client';
import { Type, Transform } from 'class-transformer';

export class TransactionQueryDto {
  @ApiProperty({ example: 'uuid-of-account', required: false })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiProperty({ example: 'uuid-of-category', required: false })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ enum: TransactionStatus, example: TransactionStatus.UNCLASSIFIED, required: false })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiProperty({ enum: TransactionType, example: TransactionType.EXPENSE, required: false })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiProperty({ enum: TransactionSource, example: TransactionSource.REVOLUT, required: false })
  @IsOptional()
  @IsEnum(TransactionSource)
  source?: TransactionSource;

  @ApiProperty({ example: '2026-10-01', required: false })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({ example: '2026-10-31', required: false })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiProperty({ example: 1, required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ example: 20, required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}