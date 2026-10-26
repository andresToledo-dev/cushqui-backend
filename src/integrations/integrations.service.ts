import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { IntegrationResponseDto } from './dto/integration-response.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

/** Número de import events recibidos con cada integración. */
const WITH_IMPORT_COUNT = { _count: { select: { importEvents: true } } } as const;

@Injectable()
export class IntegrationsService {
  constructor(private prisma: PrismaService) {}

  private toDto(integration: any, plainToken?: string): IntegrationResponseDto {
    const dto = new IntegrationResponseDto();
    dto.id = integration.id;
    dto.name = integration.name;
    dto.type = integration.type;
    dto.accountId = integration.accountId ?? undefined;
    dto.isActive = integration.isActive;
    dto.lastUsedAt = integration.lastUsedAt ?? undefined;
    dto.createdAt = integration.createdAt;
    dto.updatedAt = integration.updatedAt;
    dto.importEventsCount = integration._count?.importEvents ?? 0;
    dto.plainToken = plainToken;
    return dto;
  }

  async create(userId: string, dto: CreateIntegrationDto): Promise<IntegrationResponseDto> {
    if (dto.accountId) {
      const account = await this.prisma.account.findUnique({
        where: { id: dto.accountId },
      });

      if (!account || account.userId !== userId) {
        throw new NotFoundException('Account not found');
      }
    }

    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(plainToken, 12);

    const integration = await this.prisma.integration.create({
      data: {
        userId,
        accountId: dto.accountId,
        name: dto.name,
        type: dto.type,
        tokenHash,
      },
    });

    return this.toDto(integration, plainToken);
  }

  async findAll(userId: string): Promise<IntegrationResponseDto[]> {
    const integrations = await this.prisma.integration.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: WITH_IMPORT_COUNT,
    });

    return integrations.map((i) => this.toDto(i));
  }

  async findById(userId: string, id: string): Promise<IntegrationResponseDto> {
    const integration = await this.prisma.integration.findUnique({
      where: { id },
      include: WITH_IMPORT_COUNT,
    });

    if (!integration || integration.userId !== userId) {
      throw new NotFoundException('Integration not found');
    }

    return this.toDto(integration);
  }

  async update(userId: string, id: string, data: { name?: string; isActive?: boolean; accountId?: string | null }): Promise<IntegrationResponseDto> {
    const integration = await this.prisma.integration.findUnique({
      where: { id },
    });

    if (!integration || integration.userId !== userId) {
      throw new NotFoundException('Integration not found');
    }

    if (data.accountId !== undefined) {
      if (data.accountId) {
        const account = await this.prisma.account.findUnique({
          where: { id: data.accountId },
        });

        if (!account || account.userId !== userId) {
          throw new NotFoundException('Account not found');
        }
      }
    }

    const updated = await this.prisma.integration.update({
      where: { id },
      data: {
        name: data.name,
        isActive: data.isActive,
        accountId: data.accountId,
      },
    });

    return this.toDto(updated);
  }

  async delete(userId: string, id: string): Promise<void> {
    const integration = await this.prisma.integration.findUnique({
      where: { id },
    });

    if (!integration || integration.userId !== userId) {
      throw new NotFoundException('Integration not found');
    }

    await this.prisma.integration.delete({ where: { id } });
  }

  async regenerateToken(userId: string, id: string): Promise<IntegrationResponseDto> {
    const integration = await this.prisma.integration.findUnique({
      where: { id },
    });

    if (!integration || integration.userId !== userId) {
      throw new NotFoundException('Integration not found');
    }

    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(plainToken, 12);

    const updated = await this.prisma.integration.update({
      where: { id },
      data: { tokenHash },
    });

    return this.toDto(updated, plainToken);
  }
}