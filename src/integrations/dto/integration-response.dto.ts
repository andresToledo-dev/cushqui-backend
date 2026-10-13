import { ApiProperty } from '@nestjs/swagger';
import { IntegrationType } from '@prisma/client';

export class IntegrationResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'iPhone Shortcut' })
  name: string;

  @ApiProperty({ enum: IntegrationType, example: IntegrationType.SHORTCUT })
  type: IntegrationType;

  @ApiProperty({ example: 'uuid-of-account', required: false })
  accountId?: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2026-10-02T12:00:00.000Z', required: false })
  lastUsedAt?: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt: Date;

  @ApiProperty({ example: 'plain-token-shown-only-once', required: false })
  plainToken?: string;
}