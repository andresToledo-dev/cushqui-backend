import { IsOptional, IsUUID, IsEnum, IsDateString, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MovementType } from '@prisma/client';
import { Type } from 'class-transformer';

export class MovementQueryDto {
  @ApiProperty({ example: 'uuid-of-account', required: false, description: 'Matches source or destination account' })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiProperty({ enum: MovementType, required: false })
  @IsOptional()
  @IsEnum(MovementType)
  type?: MovementType;

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
