import { ApiProperty } from '@nestjs/swagger';

export class ImportResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: true, required: false })
  created?: boolean;

  @ApiProperty({ example: false, required: false })
  duplicate?: boolean;

  @ApiProperty({ example: 'uuid-of-transaction', required: false })
  transactionId?: string;
}