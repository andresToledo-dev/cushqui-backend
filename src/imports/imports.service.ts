import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ShortcutImportDto } from './dto/shortcut-import.dto';
import { ImportResponseDto } from './dto/import-response.dto';
import { TransactionSource, TransactionStatus, TransactionType, FinalDecision } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import * as crypto from 'crypto';
import { adjustBalance, balanceDelta } from '../accounts/account-balance.util';

@Injectable()
export class ImportsService {
  constructor(private prisma: PrismaService) {}

  async importFromShortcut(
    userId: string,
    integrationId: string,
    accountId: string,
    dto: ShortcutImportDto,
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
        await this.prisma.integration.update({
          where: { id: integrationId },
          data: { lastUsedAt: new Date() },
        });

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

      await this.prisma.integration.update({
        where: { id: integrationId },
        data: { lastUsedAt: new Date() },
      });

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
      await this.prisma.integration.update({
        where: { id: integrationId },
        data: { lastUsedAt: new Date() },
      });

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

    await this.prisma.integration.update({
      where: { id: integrationId },
      data: { lastUsedAt: new Date() },
    });

    return {
      success: true,
      created: !!transactionId,
      transactionId,
    };
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