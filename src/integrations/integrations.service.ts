import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { IntegrationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';
import { IntegrationResponseDto } from './dto/integration-response.dto';
import { generateIntegrationToken, hashIntegrationToken } from './integration-token.util';
import { findWordsRuleViolation, normalizeWords } from './notification-words.util';

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
    dto.expenseWords = integration.expenseWords ?? null;
    dto.incomeWords = integration.incomeWords ?? null;
    dto.isActive = integration.isActive;
    dto.lastUsedAt = integration.lastUsedAt ?? undefined;
    dto.createdAt = integration.createdAt;
    dto.updatedAt = integration.updatedAt;
    dto.importEventsCount = integration._count?.importEvents ?? 0;
    dto.plainToken = plainToken;
    return dto;
  }

  /**
   * Expense/income words only exist for NOTIFICATION integrations, and there they can never be empty.
   * `required` is true on create (both lists must be sent); on update a missing list keeps its value.
   * Returns the normalized lists to store (undefined = not changed).
   */
  private resolveWords(
    type: IntegrationType,
    dto: { expenseWords?: string; incomeWords?: string },
    required: boolean,
  ): { expenseWords?: string; incomeWords?: string } {
    const sent = dto.expenseWords !== undefined || dto.incomeWords !== undefined;

    if (type !== IntegrationType.NOTIFICATION) {
      if (sent) {
        throw new BadRequestException('Only NOTIFICATION integrations use expense/income words');
      }
      return {};
    }

    const result: { expenseWords?: string; incomeWords?: string } = {};
    for (const field of ['expenseWords', 'incomeWords'] as const) {
      if (dto[field] === undefined) {
        if (required) throw new BadRequestException(`${field} is required for NOTIFICATION integrations`);
        continue;
      }
      const words = normalizeWords(dto[field]!);
      if (!words) throw new BadRequestException(`${field} must contain at least one word`);
      const violation = findWordsRuleViolation(words);
      if (violation) throw new BadRequestException(`${field}: ${violation}`);
      result[field] = words;
    }
    return result;
  }

  async create(userId: string, dto: CreateIntegrationDto): Promise<IntegrationResponseDto> {
    const words = this.resolveWords(dto.type, dto, true);

    if (dto.accountId) {
      const account = await this.prisma.account.findUnique({
        where: { id: dto.accountId },
      });

      if (!account || account.userId !== userId) {
        throw new NotFoundException('Account not found');
      }
    }

    const plainToken = generateIntegrationToken();
    const tokenHash = hashIntegrationToken(plainToken);

    const integration = await this.prisma.integration.create({
      data: {
        userId,
        accountId: dto.accountId,
        name: dto.name,
        type: dto.type,
        tokenHash,
        ...words,
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

  async update(userId: string, id: string, data: UpdateIntegrationDto): Promise<IntegrationResponseDto> {
    const integration = await this.prisma.integration.findUnique({
      where: { id },
    });

    if (!integration || integration.userId !== userId) {
      throw new NotFoundException('Integration not found');
    }

    const words = this.resolveWords(integration.type, data, false);

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
        ...words,
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

    const plainToken = generateIntegrationToken();
    const tokenHash = hashIntegrationToken(plainToken);

    const updated = await this.prisma.integration.update({
      where: { id },
      data: { tokenHash },
    });

    return this.toDto(updated, plainToken);
  }
}