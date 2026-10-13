import { ApiProperty } from '@nestjs/swagger';
import { TransactionType, TransactionStatus, TransactionSource } from '@prisma/client';
import { Expose, Transform } from 'class-transformer';

export class TransactionResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'uuid-of-account' })
  accountId: string;

  @ApiProperty({ example: 'Revolut', required: false })
  accountName?: string;

  @ApiProperty({ example: 'uuid-of-category', required: false })
  categoryId?: string;

  @ApiProperty({ example: 'Alimentación', required: false })
  categoryName?: string;

  @ApiProperty({ example: 'uuid-of-subcategory', required: false })
  subcategoryId?: string;

  @ApiProperty({ example: 'Supermercado', required: false })
  subcategoryName?: string;

  @ApiProperty({ example: 25.5 })
  @Expose()
  @Transform(({ value }) => parseFloat(value.toString()))
  amount: number;

  @ApiProperty({ example: 'EUR' })
  currency: string;

  @ApiProperty({ enum: TransactionType, example: TransactionType.EXPENSE })
  type: TransactionType;

  @ApiProperty({ enum: TransactionStatus, example: TransactionStatus.CLASSIFIED })
  status: TransactionStatus;

  @ApiProperty({ enum: TransactionSource, example: TransactionSource.MANUAL })
  source: TransactionSource;

  @ApiProperty({ example: 'Continente', required: false })
  merchant?: string;

  @ApiProperty({ example: 'Compra semanal', required: false })
  description?: string;

  @ApiProperty({ example: 'ext-id-123', required: false })
  externalId?: string;

  @ApiProperty({ example: '2026-10-02T12:00:00.000Z' })
  transactionDate: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z', required: false })
  deletedAt?: Date;

  constructor(partial: Partial<TransactionResponseDto>) {
    Object.assign(this, partial);
  }
}