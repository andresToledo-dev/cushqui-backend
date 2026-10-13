import { IsString, IsNumber, Min, IsDateString, MinLength, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTransferDto {
  @ApiProperty({ example: 'revolut-account' })
  @IsString()
  fromAccountId: string;

  @ApiProperty({ example: 'activobank-account' })
  @IsString()
  toAccountId: string;

  @ApiProperty({ example: 500 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.01)
  amount: number;

  @ApiProperty({ example: 'EUR' })
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency: string;

  @ApiProperty({ example: '2026-10-02T10:00:00Z' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: 'Rent savings', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
