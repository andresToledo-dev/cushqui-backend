import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { Invitation, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationResponseDto } from './dto/invitation-response.dto';
import { generateInvitationCode, hashInvitationCode, invitationExpiry, invitationStatus } from './invitation-code.util';

type InvitationRow = Invitation & { usedBy?: { email: string } | null };

@Injectable()
export class InvitationsService {
  constructor(private prisma: PrismaService) {}

  private toDto(invitation: InvitationRow, code?: string): InvitationResponseDto {
    const dto = new InvitationResponseDto();
    dto.id = invitation.id;
    dto.email = invitation.email ?? undefined;
    dto.role = invitation.role;
    dto.status = invitationStatus(invitation);
    dto.expiresAt = invitation.expiresAt;
    dto.usedAt = invitation.usedAt ?? undefined;
    dto.usedByEmail = invitation.usedBy?.email;
    dto.revokedAt = invitation.revokedAt ?? undefined;
    dto.createdAt = invitation.createdAt;
    dto.code = code;
    return dto;
  }

  /** Invitations created through the API are always for regular users (ADMIN ones only via scripts/invitations.ts). */
  async create(adminId: string, dto: CreateInvitationDto): Promise<InvitationResponseDto> {
    const code = generateInvitationCode();

    const invitation = await this.prisma.invitation.create({
      data: {
        codeHash: hashInvitationCode(code),
        email: dto.email?.trim().toLowerCase(),
        role: UserRole.USER,
        expiresAt: invitationExpiry(dto.expiresInDays),
        createdById: adminId,
      },
    });

    return this.toDto(invitation, code);
  }

  async findAll(): Promise<InvitationResponseDto[]> {
    const invitations = await this.prisma.invitation.findMany({
      orderBy: { createdAt: 'desc' },
      include: { usedBy: { select: { email: true } } },
    });

    return invitations.map((i) => this.toDto(i));
  }

  async revoke(id: string): Promise<InvitationResponseDto> {
    const invitation = await this.prisma.invitation.findUnique({ where: { id } });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.usedAt) {
      throw new ConflictException('Invitation already used');
    }
    if (invitation.revokedAt) {
      return this.toDto(invitation);
    }

    const revoked = await this.prisma.invitation.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    return this.toDto(revoked);
  }
}
