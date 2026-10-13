import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateAccountDto } from './create-account.dto';
import { IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// The balance can only change through POST /accounts/:id/adjustments, so every change is recorded
export class UpdateAccountDto extends PartialType(OmitType(CreateAccountDto, ['balance'] as const)) {
  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
