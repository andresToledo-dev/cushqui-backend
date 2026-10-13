import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdjustBalanceDto {
  @ApiProperty({ example: 510, description: 'New balance the account should have' })
  @IsNumber({ maxDecimalPlaces: 4 })
  balance: number;

  @ApiProperty({ example: 'Missing supermarket expense', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
