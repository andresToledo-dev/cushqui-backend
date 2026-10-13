import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { AdjustBalanceDto } from './dto/adjust-balance.dto';
import { AccountResponseDto } from './dto/account-response.dto';
import { AccountType, MovementType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { recordMovement } from '../movements/movement.util';

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateAccountDto): Promise<AccountResponseDto> {
    const balance = new Decimal(dto.balance ?? 0);
    const currency = dto.currency ?? 'EUR';

    const account = await this.prisma.$transaction(async (tx) => {
      const created = await tx.account.create({
        data: {
          userId,
          name: dto.name,
          type: dto.type,
          currency,
          balance,
          icon: dto.icon,
          color: dto.color,
        },
      });

      // Always recorded (even 0) so every account history starts with its opening
      await recordMovement(tx, {
        userId,
        type: MovementType.OPENING,
        accountId: created.id,
        amount: balance,
        currency,
      });

      return created;
    });

    return this.toResponseDto(account);
  }

  async adjust(userId: string, id: string, dto: AdjustBalanceDto): Promise<AccountResponseDto> {
    const newBalance = new Decimal(dto.balance);

    const account = await this.prisma.$transaction(async (tx) => {
      const current = await tx.account.findUnique({ where: { id } });

      if (!current || current.userId !== userId) {
        throw new NotFoundException('Account not found');
      }

      const delta = newBalance.sub(current.balance);
      if (delta.isZero()) {
        return current;
      }

      // Optimistic lock: only apply if nobody changed the balance since we read it,
      // so balanceBefore/balanceAfter are exact
      const { count } = await tx.account.updateMany({
        where: { id, balance: current.balance },
        data: { balance: newBalance },
      });

      if (count === 0) {
        throw new ConflictException('Account balance changed concurrently, please retry');
      }

      await recordMovement(tx, {
        userId,
        type: MovementType.ADJUSTMENT,
        accountId: id,
        amount: delta,
        balanceBefore: current.balance,
        balanceAfter: newBalance,
        currency: current.currency,
        note: dto.note,
      });

      return { ...current, balance: newBalance };
    });

    return this.toResponseDto(account);
  }

  async findAll(userId: string): Promise<AccountResponseDto[]> {
    const accounts = await this.prisma.account.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    return accounts.map((acc) => this.toResponseDto(acc));
  }

  async findById(userId: string, id: string): Promise<AccountResponseDto> {
    const account = await this.prisma.account.findUnique({
      where: { id },
    });

    if (!account || account.userId !== userId) {
      throw new NotFoundException('Account not found');
    }

    return this.toResponseDto(account);
  }

  async update(userId: string, id: string, dto: UpdateAccountDto): Promise<AccountResponseDto> {
    const account = await this.prisma.account.findUnique({
      where: { id },
    });

    if (!account || account.userId !== userId) {
      throw new NotFoundException('Account not found');
    }

    const updated = await this.prisma.account.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        currency: dto.currency,
        isActive: dto.isActive,
        icon: dto.icon,
        color: dto.color,
      },
    });

    return this.toResponseDto(updated);
  }

  async delete(userId: string, id: string): Promise<void> {
    const account = await this.prisma.account.findUnique({
      where: { id },
    });

    if (!account || account.userId !== userId) {
      throw new NotFoundException('Account not found');
    }

    const [transactionCount, movementCount] = await Promise.all([
      this.prisma.transaction.count({ where: { accountId: id } }),
      // The OPENING alone does not count as history worth keeping
      this.prisma.accountMovement.count({
        where: {
          OR: [{ accountId: id }, { toAccountId: id }],
          type: { not: MovementType.OPENING },
        },
      }),
    ]);

    if (transactionCount > 0 || movementCount > 0) {
      await this.prisma.account.update({
        where: { id },
        data: { isActive: false },
      });
    } else {
      await this.prisma.account.delete({ where: { id } });
    }
  }

  async getBalance(userId: string, id: string): Promise<{ balance: number }> {
    const account = await this.prisma.account.findUnique({
      where: { id },
    });

    if (!account || account.userId !== userId) {
      throw new NotFoundException('Account not found');
    }

    return { balance: account.balance.toNumber() };
  }

  private toResponseDto(account: {
    id: string;
    name: string;
    type: AccountType;
    currency: string;
    balance: Decimal;
    isActive: boolean;
    icon: string | null;
    color: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): AccountResponseDto {
    return new AccountResponseDto({
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      balance: account.balance.toNumber(),
      isActive: account.isActive,
      icon: account.icon ?? undefined,
      color: account.color ?? undefined,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    });
  }
}