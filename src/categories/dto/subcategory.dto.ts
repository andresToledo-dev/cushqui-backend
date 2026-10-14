import { IsString, IsOptional, MaxLength, MinLength, Matches } from 'class-validator';
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

  // Chosen by the frontend (it previews the faded shade before creating). The type is not sent:
  // a subcategory always has the type of its parent.
  @ApiProperty({ example: '#FF895D', description: 'Hex color #RRGGBB' })
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color must be a hex color like #FF895D' })
  color: string;
}

export class UpdateSubcategoryDto {
  @ApiProperty({ example: 'Juan Pablo Updated', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string;
}
