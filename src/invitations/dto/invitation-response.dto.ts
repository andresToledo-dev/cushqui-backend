import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { InvitationStatus } from '../invitation-code.util';

export class InvitationResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'friend@example.com', required: false })
  email?: string;

  @ApiProperty({ enum: UserRole, example: UserRole.USER })
  role: UserRole;

  @ApiProperty({ enum: ['PENDING', 'USED', 'EXPIRED', 'REVOKED'], example: 'PENDING' })
  status: InvitationStatus;

  @ApiProperty({ example: '2026-01-08T00:00:00.000Z' })
  expiresAt: Date;

  @ApiProperty({ example: '2026-01-02T00:00:00.000Z', required: false })
  usedAt?: Date;

  @ApiProperty({ example: 'friend@example.com', required: false, description: 'Email of the user who registered with it' })
  usedByEmail?: string;

  @ApiProperty({ example: '2026-01-03T00:00:00.000Z', required: false })
  revokedAt?: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({
    example: 'K7QF-M2XH-9RTB',
    required: false,
    description: 'Only returned when the invitation is created; it cannot be recovered later',
  })
  code?: string;
}
