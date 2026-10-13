import { IsString, IsEnum, IsOptional, IsNumber, Min, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AccountType } from '@prisma/client';

export class CreateAccountDto {
  @ApiProperty({ example: 'Revolut' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: AccountType, example: AccountType.BANK })
  @IsEnum(AccountType)
  type: AccountType;

  @ApiProperty({ example: 'EUR', required: false })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string = 'EUR';

  @ApiProperty({ example: 0, required: false })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  // No default initializer: PartialType would inherit it and reset the balance on every PATCH
  balance?: number;

  @ApiProperty({ example: '🏠', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  icon?: string;

  @ApiProperty({ example: '#FFD700', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  color?: string;
}