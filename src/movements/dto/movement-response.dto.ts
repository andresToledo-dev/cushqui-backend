import { ApiProperty } from '@nestjs/swagger';
import { MovementType } from '@prisma/client';

export class MovementAccountDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Revolut' })
  name: string;
}

export class MovementResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ enum: MovementType, example: MovementType.TRANSFER })
  type: MovementType;

  @ApiProperty({ example: 30, description: 'OPENING/TRANSFER: positive. ADJUSTMENT: signed (+10 / -10)' })
  amount: number;

  @ApiProperty({ example: 'EUR' })
  currency: string;

  @ApiProperty({ type: MovementAccountDto, description: 'OPENING/ADJUSTMENT: the account. TRANSFER: source account' })
  account: MovementAccountDto;

  @ApiProperty({ type: MovementAccountDto, required: false, description: 'TRANSFER only: destination account' })
  toAccount?: MovementAccountDto;

  @ApiProperty({ example: 500, required: false, description: 'ADJUSTMENT only' })
  balanceBefore?: number;

  @ApiProperty({ example: 510, required: false, description: 'ADJUSTMENT only' })
  balanceAfter?: number;

  @ApiProperty({ example: 'Missing supermarket expense', required: false })
  note?: string;

  @ApiProperty({ example: '2026-10-13T10:00:00.000Z' })
  movementDate: Date;

  @ApiProperty({ example: '2026-10-13T10:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-10-13T10:00:00.000Z', description: 'Differs from createdAt when a TRANSFER was edited' })
  updatedAt: Date;

  constructor(partial: Partial<MovementResponseDto>) {
    Object.assign(this, partial);
  }
}
