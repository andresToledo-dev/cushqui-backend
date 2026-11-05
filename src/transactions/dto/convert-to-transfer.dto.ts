import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConvertToTransferDto {
  @ApiProperty({
    example: 'uuid-of-account',
    required: false,
    description: 'The other account, when only this side was imported. Send this or otherTransactionId, not both',
  })
  @IsOptional()
  @IsString()
  otherAccountId?: string;

  @ApiProperty({
    example: 'uuid-of-transaction',
    required: false,
    description: 'The other side of the transfer, when both were imported: opposite type, same amount, unclassified',
  })
  @IsOptional()
  @IsString()
  otherTransactionId?: string;

  @ApiProperty({ example: 'Savings', required: false, description: 'Defaults to the merchant' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
