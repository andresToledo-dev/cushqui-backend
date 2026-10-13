import { IsOptional, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class StatisticsQueryDto {
  @ApiProperty({ example: '2026-10-01', required: false })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({ example: '2026-10-31', required: false })
  @IsOptional()
  @IsDateString()
  to?: string;
}