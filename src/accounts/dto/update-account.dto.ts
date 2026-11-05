import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateAccountDto } from './create-account.dto';
import { IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

// enableImplicitConversion turns any non-empty string into true ("false" included) before validating:
// keeping the raw value lets @IsBoolean reject it.
const KeepRawValue = () => Transform(({ obj, key }) => obj[key]);

// The balance can only change through POST /accounts/:id/adjustments, so every change is recorded.
// openingDate only makes sense when the account (and its OPENING movement) is created.
// isActive is not here: an account is only closed through DELETE, and that is final.
export class UpdateAccountDto extends PartialType(OmitType(CreateAccountDto, ['balance', 'openingDate'] as const)) {
  @ApiProperty({ example: true, required: false, description: 'Show the account in the accounts list' })
  @IsOptional()
  @KeepRawValue()
  @IsBoolean()
  visibleInList?: boolean;

  @ApiProperty({ example: true, required: false, description: 'Show the balance of the account' })
  @IsOptional()
  @KeepRawValue()
  @IsBoolean()
  balanceVisible?: boolean;
}
