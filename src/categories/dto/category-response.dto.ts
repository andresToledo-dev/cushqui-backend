import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { TransactionType } from '@prisma/client';

export class CategoryResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Alimentación' })
  name: string;

  @ApiProperty({ enum: TransactionType, example: TransactionType.EXPENSE })
  type: TransactionType;

  @ApiProperty({ example: '🍔', required: false })
  icon?: string;

  @ApiProperty({ example: '#FF5733', required: false })
  color?: string;

  @ApiProperty({ example: null, required: false })
  @Expose()
  userId?: string | null;

  @ApiProperty({ example: null, required: false })
  @Expose()
  parentId?: string | null;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt: Date;

  @ApiProperty({ type: [CategoryResponseDto], required: false })
  subcategories?: CategoryResponseDto[];

  constructor(partial: Partial<CategoryResponseDto>) {
    Object.assign(this, partial);
  }
}