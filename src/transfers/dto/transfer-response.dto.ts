import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';

export class TransferResponseDto {
  @ApiProperty({ example: 'uuid-of-transfer-movement' })
  movementId: string;

  @ApiProperty({ example: 500 })
  @Expose()
  @Transform(({ value }) => parseFloat(value.toString()))
  amount: number;

  @ApiProperty({ example: 'EUR' })
  currency: string;

  @ApiProperty({ example: '2026-10-02T10:00:00.000Z' })
  date: Date;
}
