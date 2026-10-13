import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ClassifyTransactionDto {
  @ApiProperty({ example: 'cat-loans' })
  @IsString()
  categoryId: string;
}