import { Injectable, BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationImportDto } from './dto/notification-import.dto';
import { ManualImportDto } from './dto/manual-import.dto';
import { ImportResponseDto } from './dto/import-response.dto';
import { TransactionSource, TransactionStatus, TransactionType, FinalDecision, IntegrationType, Account } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import * as crypto from 'crypto';
import { adjustBalance, balanceDelta } from '../accounts/account-balance.util';

@Injectable()
export class ImportsService {
  constructor(private prisma: PrismaService) {}

  async importFromNotification(
    userId: string,
    integrationId: string,
    accountId: string,
    dto: NotificationImportDto,
  ): Promise<ImportResponseDto> {
    // Parse the message to extract amount and determine transaction type
    const { amount, finalDecision, merchant } = this.parseMessage(dto.message);

    // If no valid amount found, still create ImportEvent with N/A decision
    if (amount === null) {
      const fingerprint = this.generateFingerprint(
        userId,
        accountId,
        TransactionSource.REVOLUT,
        0,
        'EUR',
        'unknown',
        dto.date,
        dto.externalId,
      );

      const existingEvent = await this.prisma.importEvent.findUnique({
        where: { fingerprint },
        include: { transaction: true },
      });

      if (existingEvent) {
        await this.touchIntegration(integrationId);

        return {
          success: true,
          created: false,
          duplicate: true,
          transactionId: existingEvent.transactionId ?? undefined,
        };
      }

      await this.prisma.importEvent.create({
        data: {
          userId,
          integrationId,
          source: TransactionSource.REVOLUT,
          externalId: dto.externalId,
          fingerprint,
          message: dto.message,
          finalDecision: FinalDecision.NA,
        },
      });

      await this.touchIntegration(integrationId);

      return {
        success: true,
        created: false,
        transactionId: undefined,
      };
    }

    const fingerprint = this.generateFingerprint(
      userId,
      accountId,
      TransactionSource.REVOLUT,
      amount,
      'EUR',
      merchant,
      dto.date,
      dto.externalId,
    );

    const existingEvent = await this.prisma.importEvent.findUnique({
      where: { fingerprint },
      include: { transaction: true },
    });

    if (existingEvent) {
      await this.touchIntegration(integrationId);

      return {
        success: true,
        created: false,
        duplicate: true,
        transactionId: existingEvent.transactionId ?? undefined,
      };
    }

    let transactionId: string | undefined;

    if (finalDecision === FinalDecision.EXPENSE || finalDecision === FinalDecision.INCOME) {
      const type = finalDecision === FinalDecision.EXPENSE ? TransactionType.EXPENSE : TransactionType.INCOME;
      const decimalAmount = new Decimal(amount);

      const transaction = await this.prisma.$transaction(async (tx) => {
        const created = await tx.transaction.create({
          data: {
            userId,
            accountId,
            amount: decimalAmount,
            currency: 'EUR',
            type,
            status: TransactionStatus.UNCLASSIFIED,
            source: TransactionSource.REVOLUT,
            merchant,
            transactionDate: new Date(dto.date),
            externalId: dto.externalId,
          },
        });

        // Update account balance
        await adjustBalance(tx, accountId, balanceDelta(type, decimalAmount));

        return created;
      });

      transactionId = transaction.id;
    }

    await this.prisma.importEvent.create({
      data: {
        userId,
        integrationId,
        source: TransactionSource.REVOLUT,
        externalId: dto.externalId,
        fingerprint,
        message: dto.message,
        finalDecision,
        transactionId,
      },
    });

    await this.touchIntegration(integrationId);

    return {
      success: true,
      created: !!transactionId,
      transactionId,
    };
  }

  /**
   * Import sent explicitly by a MANUAL integration: the caller gives type, amount and account
   * (by id or by name) and the transaction is created UNCLASSIFIED, like a notification import.
   */
  async importManual(
    integration: { id: string; userId: string; type: IntegrationType },
    dto: ManualImportDto,
  ): Promise<ImportResponseDto> {
    if (integration.type !== IntegrationType.MANUAL) {
      throw new ForbiddenException('Manual imports require a MANUAL integration token');
    }

    const userId = integration.userId;
    const account = await this.resolveManualAccount(userId, dto);
    const transactionDate = dto.date ? new Date(dto.date) : new Date();
    const description = dto.description?.trim() || undefined;

    // Without externalId every request is a new import (same amount on the same day is legitimate);
    // with externalId a retry of the same operation is reported as duplicate
    const fingerprint = this.generateFingerprint(
      userId,
      account.id,
      TransactionSource.MANUAL,
      dto.amount,
      account.currency,
      `${dto.type}|${description ?? ''}`,
      dto.externalId ? transactionDate.toISOString() : crypto.randomUUID(),
      dto.externalId,
    );

    const existingEvent = await this.prisma.importEvent.findUnique({ where: { fingerprint } });

    if (existingEvent) {
      await this.touchIntegration(integration.id);
      return {
        success: true,
        created: false,
        duplicate: true,
        transactionId: existingEvent.transactionId ?? undefined,
      };
    }

    const amount = new Decimal(dto.amount);

    const transaction = await this.prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          userId,
          accountId: account.id,
          amount,
          currency: account.currency,
          type: dto.type,
          status: TransactionStatus.UNCLASSIFIED,
          source: TransactionSource.MANUAL,
          merchant: description,
          transactionDate,
          externalId: dto.externalId,
        },
      });

      await adjustBalance(tx, account.id, balanceDelta(dto.type, amount));

      return created;
    });

    await this.prisma.importEvent.create({
      data: {
        userId,
        integrationId: integration.id,
        source: TransactionSource.MANUAL,
        externalId: dto.externalId,
        fingerprint,
        message: `Manual import: ${dto.type} ${amount.toFixed(2)} ${account.currency} in "${account.name}"${description ? ` - ${description}` : ''}`,
        finalDecision: dto.type === TransactionType.EXPENSE ? FinalDecision.EXPENSE : FinalDecision.INCOME,
        transactionId: transaction.id,
      },
    });

    await this.touchIntegration(integration.id);

    return {
      success: true,
      created: true,
      transactionId: transaction.id,
    };
  }

  private async resolveManualAccount(userId: string, dto: ManualImportDto): Promise<Account> {
    if (!dto.accountId === !dto.accountName) {
      throw new BadRequestException('Send exactly one of accountId or accountName');
    }

    let account: Account | null;

    if (dto.accountId) {
      account = await this.prisma.account.findFirst({ where: { id: dto.accountId, userId } });
    } else {
      const matches = await this.prisma.account.findMany({
        where: { userId, isActive: true, name: { equals: dto.accountName!.trim(), mode: 'insensitive' } },
      });
      if (matches.length > 1) {
        throw new ConflictException(`More than one active account is named "${dto.accountName}": use accountId`);
      }
      account = matches[0] ?? null;
    }

    if (!account) {
      throw new NotFoundException('Account not found');
    }
    if (!account.isActive) {
      throw new BadRequestException('Account is inactive');
    }

    return account;
  }

  private async touchIntegration(integrationId: string): Promise<void> {
    await this.prisma.integration.update({
      where: { id: integrationId },
      data: { lastUsedAt: new Date() },
    });
  }

  private parseMessage(message: string): { amount: number | null; finalDecision: FinalDecision; merchant: string } {
    // Extract amount - number before € symbol
    const amountMatch = message.match(/(\d+[.,]?\d*)\s*€/);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : null;

    // Determine transaction type based on keywords
    const lowerMessage = message.toLowerCase();

    const expenseKeywords = ['has enviado', 'has gastado'];
    const incomeKeywords = ['has recibido', 'te ha enviado dinero'];

    let finalDecision: FinalDecision = FinalDecision.NA;

    if (expenseKeywords.some((keyword) => lowerMessage.includes(keyword))) {
      finalDecision = FinalDecision.EXPENSE;
    } else if (incomeKeywords.some((keyword) => lowerMessage.includes(keyword))) {
      finalDecision = FinalDecision.INCOME;
    }

    // Extract merchant - try to get the name after "a " or "de " or similar patterns
    let merchant = 'unknown';
    const merchantPatterns = [
      // More specific patterns for Spanish banking notifications (must come first)
      /has enviado\s+[\d.,]+\s*€\s+a\s+([^.]+)(?:\.|$)/i,
      /has gastado\s+[\d.,]+\s*€\s+en\s+([^.]+)(?:\.|$)/i,
      /has recibido\s+[\d.,]+\s*€\s+de\s+([^.]+)(?:\.|$)/i,
      /te ha enviado dinero\s+[\d.,]+\s*€\s+de\s+([^.]+)(?:\.|$)/i,
      // Generic patterns (come after specific ones)
      /a\s+([^.]+)(?:\.|$)/i,  // "a Juan Pablo."
      /de\s+([^.]+)(?:\.|$)/i, // "de Empresa SL."
      /para\s+([^.]+)(?:\.|$)/i, // "para Juan Pablo."
    ];

    for (const pattern of merchantPatterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        merchant = match[1].trim();
        break;
      }
    }

    return { amount, finalDecision, merchant };
  }

  private generateFingerprint(
    userId: string,
    accountId: string,
    source: TransactionSource,
    amount: number,
    currency: string,
    merchant: string,
    transactionDate: string,
    externalId?: string,
  ): string {
    const data = `${userId}|${accountId}|${source}|${amount}|${currency}|${merchant}|${transactionDate}|${externalId ?? ''}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}