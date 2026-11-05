import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { ClassifyTransactionDto } from './dto/classify-transaction.dto';
import { ConvertToTransferDto } from './dto/convert-to-transfer.dto';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';
import { PaginatedResponseDto, PaginatedMetaDto } from './dto/paginated-response.dto';
import { MovementType, TransactionType, TransactionStatus, TransactionSource, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { adjustBalance, assertAccountsActive, balanceDelta } from '../accounts/account-balance.util';
import { MovementResponseDto } from '../movements/dto/movement-response.dto';
import { movementInclude, recordMovement, toMovementResponseDto } from '../movements/movement.util';

/** How far apart the two sides of a transfer can be to be proposed as candidates. */
const TRANSFER_CANDIDATE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_TRANSFER_CANDIDATES = 20;

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Validates the category/subcategory a transaction will end up with: both owned by the user,
   * the category of the same type as the transaction and the subcategory a child of that category.
   */
  private async validateClassification(
    userId: string,
    type: TransactionType,
    categoryId: string | null,
    subcategoryId: string | null,
  ): Promise<void> {
    if (!categoryId) {
      if (subcategoryId) throw new BadRequestException('A subcategory requires its category');
      return;
    }

    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category || category.userId !== userId) {
      throw new NotFoundException('Category not found');
    }
    if (category.type !== type) {
      throw new BadRequestException(`Category "${category.name}" is ${category.type} and the transaction is ${type}`);
    }

    if (subcategoryId) {
      const subcategory = await this.prisma.category.findUnique({ where: { id: subcategoryId } });
      if (!subcategory || subcategory.userId !== userId) {
        throw new NotFoundException('Subcategory not found');
      }
      if (subcategory.parentId !== categoryId) {
        throw new BadRequestException(`Subcategory "${subcategory.name}" does not belong to category "${category.name}"`);
      }
    }
  }

  async create(userId: string, dto: CreateTransactionDto): Promise<TransactionResponseDto> {
    const account = await this.prisma.account.findUnique({
      where: { id: dto.accountId },
    });

    if (!account || account.userId !== userId) {
      throw new NotFoundException('Account not found');
    }

    await assertAccountsActive(this.prisma, [dto.accountId]);

    const categoryId = dto.categoryId || null;
    const subcategoryId = dto.subcategoryId || null;
    await this.validateClassification(userId, dto.type, categoryId, subcategoryId);
    const status = categoryId ? TransactionStatus.CLASSIFIED : TransactionStatus.UNCLASSIFIED;

    const amount = new Decimal(dto.amount);

    const transaction = await this.prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          userId,
          accountId: dto.accountId,
          categoryId,
          subcategoryId,
          amount,
          currency: dto.currency ?? 'EUR',
          type: dto.type,
          status,
          source: dto.source ?? TransactionSource.MANUAL,
          merchant: dto.merchant,
          description: dto.description,
          transactionDate: new Date(dto.transactionDate),
        },
        include: {
          account: true,
          category: true,
          subcategory: true,
        },
      });

      await adjustBalance(tx, dto.accountId, balanceDelta(dto.type, amount));

      return created;
    });

    return this.toResponseDto(transaction);
  }

  async findAll(userId: string, query: TransactionQueryDto): Promise<PaginatedResponseDto<TransactionResponseDto>> {
    const { page = 1, limit = 20, ...filters } = query;

    const where: Prisma.TransactionWhereInput = {
      userId,
      deletedAt: null,
      ...(filters.accountId && { accountId: filters.accountId }),
      ...(filters.categoryId && { categoryId: filters.categoryId }),
      ...(filters.status && { status: filters.status }),
      ...(filters.type && { type: filters.type }),
      ...(filters.source && { source: filters.source }),
      ...((filters.from || filters.to) && {
        transactionDate: {
          ...(filters.from && { gte: new Date(filters.from) }),
          ...(filters.to && { lte: new Date(filters.to) }),
        },
      }),
    };

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: {
          account: true,
          category: true,
          subcategory: true,
        },
        orderBy: { transactionDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: transactions.map((tx) => this.toResponseDto(tx)),
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async findById(userId: string, id: string): Promise<TransactionResponseDto> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        account: true,
        category: true,
        subcategory: true,
      },
    });

    if (!transaction || transaction.userId !== userId || transaction.deletedAt !== null) {
      throw new NotFoundException('Transaction not found');
    }

    return this.toResponseDto(transaction);
  }

  async update(userId: string, id: string, dto: UpdateTransactionDto): Promise<TransactionResponseDto> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
    });

    if (!transaction || transaction.userId !== userId || transaction.deletedAt !== null) {
      throw new NotFoundException('Transaction not found');
    }

    if (dto.accountId && dto.accountId !== transaction.accountId) {
      const newAccount = await this.prisma.account.findUnique({
        where: { id: dto.accountId },
      });

      if (!newAccount || newAccount.userId !== userId) {
        throw new NotFoundException('Account not found');
      }
    }

    const oldAmount = transaction.amount;
    const oldType = transaction.type;
    const newAmount = dto.amount !== undefined ? new Decimal(dto.amount) : transaction.amount;
    const newType = dto.type ?? transaction.type;
    const newAccountId = dto.accountId ?? transaction.accountId;

    // Forms resend amount and type: only a real change counts, so old transactions of a closed account stay editable
    const balanceChanged =
      newAccountId !== transaction.accountId || !balanceDelta(newType, newAmount).equals(balanceDelta(oldType, oldAmount));
    if (balanceChanged) {
      await assertAccountsActive(this.prisma, [transaction.accountId, newAccountId]);
    }

    // Validate the classification the transaction ends up with (e.g. changing EXPENSE → INCOME
    // requires an INCOME category). A new category without subcategory drops the old subcategory.
    const categoryChanged = dto.categoryId !== undefined && (dto.categoryId || null) !== transaction.categoryId;
    const categoryId = dto.categoryId !== undefined ? dto.categoryId || null : transaction.categoryId;
    const subcategoryId =
      dto.subcategoryId !== undefined ? dto.subcategoryId || null : categoryChanged ? null : transaction.subcategoryId;
    await this.validateClassification(userId, newType, categoryId, subcategoryId);
    const status = dto.categoryId !== undefined ? (categoryId ? TransactionStatus.CLASSIFIED : TransactionStatus.UNCLASSIFIED) : transaction.status;

    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.transaction.update({
        where: { id },
        data: {
          accountId: dto.accountId,
          categoryId,
          subcategoryId,
          amount: dto.amount !== undefined ? new Decimal(dto.amount) : undefined,
          currency: dto.currency,
          type: dto.type,
          status,
          source: dto.source,
          merchant: dto.merchant,
          description: dto.description,
          transactionDate: dto.transactionDate ? new Date(dto.transactionDate) : undefined,
        },
        include: {
          account: true,
          category: true,
          subcategory: true,
        },
      });

      if (balanceChanged) {
        // Revert the old effect on the old account, then apply the new effect on the (possibly new) account
        await adjustBalance(tx, transaction.accountId, balanceDelta(oldType, oldAmount).neg());
        await adjustBalance(tx, newAccountId, balanceDelta(newType, newAmount));
      }

      return updated;
    });

    return this.toResponseDto(updated);
  }

  async delete(userId: string, id: string): Promise<void> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
    });

    if (!transaction || transaction.userId !== userId || transaction.deletedAt !== null) {
      throw new NotFoundException('Transaction not found');
    }

    await assertAccountsActive(this.prisma, [transaction.accountId]);

    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await adjustBalance(tx, transaction.accountId, balanceDelta(transaction.type, transaction.amount).neg());
    });
  }

  async classify(userId: string, id: string, dto: ClassifyTransactionDto): Promise<TransactionResponseDto> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
    });

    if (!transaction || transaction.userId !== userId || transaction.deletedAt !== null) {
      throw new NotFoundException('Transaction not found');
    }

    // Same category keeps its subcategory; a different one drops it (it belonged to the old category)
    const subcategoryId = dto.categoryId === transaction.categoryId ? transaction.subcategoryId : null;
    await this.validateClassification(userId, transaction.type, dto.categoryId, subcategoryId);

    const updated = await this.prisma.transaction.update({
      where: { id },
      data: {
        categoryId: dto.categoryId,
        subcategoryId,
        status: TransactionStatus.CLASSIFIED,
      },
      include: {
        account: true,
        category: true,
        subcategory: true,
      },
    });

    return this.toResponseDto(updated);
  }

  private async findConvertible(userId: string, id: string) {
    const transaction = await this.prisma.transaction.findUnique({ where: { id } });

    if (!transaction || transaction.userId !== userId || transaction.deletedAt !== null) {
      throw new NotFoundException('Transaction not found');
    }
    if (transaction.status !== TransactionStatus.UNCLASSIFIED) {
      throw new BadRequestException('Only unclassified transactions can be converted to a transfer');
    }

    return transaction;
  }

  /**
   * Replaces an imported expense or income with the TRANSFER it really was. The transaction is soft deleted,
   * so its ImportEvent still detects a resent notification.
   * With both sides imported the balances already reflect the transfer; with one, only the other account changes.
   */
  async convertToTransfer(userId: string, id: string, dto: ConvertToTransferDto): Promise<MovementResponseDto> {
    if (!dto.otherAccountId === !dto.otherTransactionId) {
      throw new BadRequestException('Send exactly one of otherAccountId or otherTransactionId');
    }

    const transaction = await this.findConvertible(userId, id);
    const other = dto.otherTransactionId ? await this.findConvertible(userId, dto.otherTransactionId) : null;

    if (other && (other.type === transaction.type || !other.amount.equals(transaction.amount))) {
      throw new BadRequestException('The other transaction must have the opposite type and the same amount');
    }

    const otherAccountId = other?.accountId ?? dto.otherAccountId!;
    if (otherAccountId === transaction.accountId) {
      throw new BadRequestException('Cannot transfer to the same account');
    }

    const otherAccount = await this.prisma.account.findUnique({ where: { id: otherAccountId } });
    if (!otherAccount || otherAccount.userId !== userId) {
      throw new NotFoundException('Account not found');
    }
    if (otherAccount.currency !== transaction.currency || (other && other.currency !== transaction.currency)) {
      throw new BadRequestException('Currency mismatch between accounts');
    }

    await assertAccountsActive(this.prisma, [transaction.accountId, otherAccountId]);

    const isExpense = transaction.type === TransactionType.EXPENSE;
    const outgoing = isExpense || !other ? transaction : other;
    const transactionIds = other ? [transaction.id, other.id] : [transaction.id];

    const movement = await this.prisma.$transaction(async (tx) => {
      const created = await recordMovement(tx, {
        userId,
        type: MovementType.TRANSFER,
        accountId: isExpense ? transaction.accountId : otherAccountId,
        toAccountId: isExpense ? otherAccountId : transaction.accountId,
        amount: transaction.amount,
        currency: transaction.currency,
        note: dto.note ?? transaction.merchant ?? other?.merchant ?? undefined,
        movementDate: outgoing.transactionDate,
      });

      // Conditional update: converting twice at once must not apply the transfer twice
      const { count } = await tx.transaction.updateMany({
        where: { id: { in: transactionIds }, deletedAt: null, status: TransactionStatus.UNCLASSIFIED },
        data: { deletedAt: new Date(), convertedToMovementId: created.id },
      });
      if (count !== transactionIds.length) {
        throw new ConflictException('Transaction changed concurrently, please retry');
      }

      if (!other) {
        await adjustBalance(tx, otherAccountId, isExpense ? transaction.amount : transaction.amount.neg());
      }

      return tx.accountMovement.findUnique({ where: { id: created.id }, include: movementInclude });
    });

    return toMovementResponseDto(movement!);
  }

  /** Transactions that could be the other side of this one. The user always confirms: equal amounts can be a coincidence. */
  async findTransferCandidates(userId: string, id: string): Promise<TransactionResponseDto[]> {
    const transaction = await this.findConvertible(userId, id);
    const time = transaction.transactionDate.getTime();

    const candidates = await this.prisma.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        status: TransactionStatus.UNCLASSIFIED,
        type: transaction.type === TransactionType.EXPENSE ? TransactionType.INCOME : TransactionType.EXPENSE,
        amount: transaction.amount,
        currency: transaction.currency,
        accountId: { not: transaction.accountId },
        account: { isActive: true },
        transactionDate: {
          gte: new Date(time - TRANSFER_CANDIDATE_WINDOW_MS),
          lte: new Date(time + TRANSFER_CANDIDATE_WINDOW_MS),
        },
      },
      include: { account: true, category: true, subcategory: true },
    });

    return candidates
      .sort((a, b) => Math.abs(a.transactionDate.getTime() - time) - Math.abs(b.transactionDate.getTime() - time))
      .slice(0, MAX_TRANSFER_CANDIDATES)
      .map((candidate) => this.toResponseDto(candidate));
  }

  private toResponseDto(transaction: {
    id: string;
    userId: string;
    accountId: string;
    categoryId: string | null;
    subcategoryId: string | null;
    amount: Decimal;
    currency: string;
    type: TransactionType;
    status: TransactionStatus;
    source: TransactionSource;
    merchant: string | null;
    description: string | null;
    externalId: string | null;
    transactionDate: Date;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    account: { id: string; name: string } | null;
    category: { id: string; name: string } | null;
    subcategory: { id: string; name: string } | null;
  }): TransactionResponseDto {
    return new TransactionResponseDto({
      id: transaction.id,
      accountId: transaction.accountId,
      accountName: transaction.account?.name,
      categoryId: transaction.categoryId ?? undefined,
      categoryName: transaction.category?.name,
      subcategoryId: transaction.subcategoryId ?? undefined,
      subcategoryName: transaction.subcategory?.name,
      amount: transaction.amount.toNumber(),
      currency: transaction.currency,
      type: transaction.type,
      status: transaction.status,
      source: transaction.source,
      merchant: transaction.merchant ?? undefined,
      description: transaction.description ?? undefined,
      externalId: transaction.externalId ?? undefined,
      transactionDate: transaction.transactionDate,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      deletedAt: transaction.deletedAt ?? undefined,
    });
  }
}