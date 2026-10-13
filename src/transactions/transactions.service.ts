import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { ClassifyTransactionDto } from './dto/classify-transaction.dto';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';
import { PaginatedResponseDto, PaginatedMetaDto } from './dto/paginated-response.dto';
import { TransactionType, TransactionStatus, TransactionSource, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { adjustBalance, balanceDelta } from '../accounts/account-balance.util';

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateTransactionDto): Promise<TransactionResponseDto> {
    const account = await this.prisma.account.findUnique({
      where: { id: dto.accountId },
    });

    if (!account || account.userId !== userId) {
      throw new NotFoundException('Account not found');
    }

    let categoryId: string | null = dto.categoryId ?? null;
    let status: TransactionStatus = TransactionStatus.CLASSIFIED;

    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });

      if (!category || (category.userId && category.userId !== userId)) {
        throw new NotFoundException('Category not found');
      }
    } else {
      status = TransactionStatus.UNCLASSIFIED;
      categoryId = null;
    }

    const amount = new Decimal(dto.amount);

    const transaction = await this.prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          userId,
          accountId: dto.accountId,
          categoryId,
          subcategoryId: dto.subcategoryId,
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

    let categoryId = dto.categoryId ?? transaction.categoryId;
    let status = transaction.status;

    if (dto.categoryId !== undefined) {
      if (dto.categoryId) {
        const category = await this.prisma.category.findUnique({
          where: { id: dto.categoryId },
        });

        if (!category || (category.userId && category.userId !== userId)) {
          throw new NotFoundException('Category not found');
        }
        status = TransactionStatus.CLASSIFIED;
      } else {
        categoryId = null;
        status = TransactionStatus.UNCLASSIFIED;
      }
    }

    const oldAmount = transaction.amount;
    const oldType = transaction.type;
    const newAmount = dto.amount !== undefined ? new Decimal(dto.amount) : transaction.amount;
    const newType = dto.type ?? transaction.type;
    const newAccountId = dto.accountId ?? transaction.accountId;

    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.transaction.update({
        where: { id },
        data: {
          accountId: dto.accountId,
          categoryId,
          subcategoryId: dto.subcategoryId,
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

      if (dto.amount !== undefined || dto.type !== undefined || newAccountId !== transaction.accountId) {
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

    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });

    if (!category || (category.userId && category.userId !== userId)) {
      throw new NotFoundException('Category not found');
    }

    const updated = await this.prisma.transaction.update({
      where: { id },
      data: {
        categoryId: dto.categoryId,
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