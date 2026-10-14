import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateAccountDto } from './create-account.dto';
import { IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// The balance can only change through POST /accounts/:id/adjustments, so every change is recorded.
// openingDate only makes sense when the account (and its OPENING movement) is created.
export class UpdateAccountDto extends PartialType(OmitType(CreateAccountDto, ['balance', 'openingDate'] as const)) {
  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
