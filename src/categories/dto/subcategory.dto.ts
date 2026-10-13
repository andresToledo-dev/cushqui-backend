import { IsString, IsOptional, MaxLength, IsUUID, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSubcategoryDto {
  @ApiProperty({ example: 'Juan Pablo' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;

  @ApiProperty({ example: 'cat-loans' })
  @IsString()
  parentCategoryId: string;
}

export class UpdateSubcategoryDto {
  @ApiProperty({ example: 'Juan Pablo Updated', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string;
}