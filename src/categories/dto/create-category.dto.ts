import { IsString, IsOptional, MaxLength, IsUUID, MinLength, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TransactionType } from '@prisma/client';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Alimentación' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;

  @ApiProperty({ enum: TransactionType, example: TransactionType.EXPENSE, description: 'EXPENSE or INCOME. Subcategories inherit it' })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiProperty({ example: '🍔', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  icon?: string;

  @ApiProperty({ example: '#FF5733', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  color?: string;

  @ApiProperty({ example: 'uuid-of-parent-category', required: false })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}