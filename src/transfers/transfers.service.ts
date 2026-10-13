import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { UpdateTransferDto } from './dto/update-transfer.dto';
import { TransferResponseDto } from './dto/transfer-response.dto';
import { MovementResponseDto } from '../movements/dto/movement-response.dto';
import { MovementType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { adjustBalance } from '../accounts/account-balance.util';
import { movementInclude, recordMovement, toMovementResponseDto } from '../movements/movement.util';

@Injectable()
export class TransfersService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateTransferDto): Promise<TransferResponseDto> {
    const { fromAccount } = await this.validateAccounts(userId, dto.fromAccountId, dto.toAccountId, dto.currency);

    const amount = new Decimal(dto.amount);
    const date = new Date(dto.date);

    // Check if source account has sufficient balance
    if (fromAccount.balance.lessThan(amount)) {
      throw new BadRequestException('Insufficient balance in source account');
    }

    const movement = await this.prisma.$transaction(async (tx) => {
      const created = await recordMovement(tx, {
        userId,
        type: MovementType.TRANSFER,
        accountId: dto.fromAccountId,
        toAccountId: dto.toAccountId,
        amount,
        currency: dto.currency,
        note: dto.note,
        movementDate: date,
      });

      await adjustBalance(tx, dto.fromAccountId, amount.neg());
      await adjustBalance(tx, dto.toAccountId, amount);

      return created;
    });

    const result = new TransferResponseDto();
    result.movementId = movement.id;
    result.amount = amount.toNumber();
    result.currency = dto.currency;
    result.date = date;
    return result;
  }

  /**
   * TRANSFER is the only editable movement. The edit leaves no trace: the old effect
   * is reverted, the new one applied, and the same row is updated.
   */
  async update(userId: string, id: string, dto: UpdateTransferDto): Promise<MovementResponseDto> {
    const existing = await this.prisma.accountMovement.findUnique({ where: { id } });

    if (!existing || existing.userId !== userId || existing.type !== MovementType.TRANSFER || !existing.toAccountId) {
      throw new NotFoundException('Transfer not found');
    }

    const oldFromId = existing.accountId;
    const oldToId = existing.toAccountId;
    const oldAmount = existing.amount;

    const newFromId = dto.fromAccountId ?? oldFromId;
    const newToId = dto.toAccountId ?? oldToId;
    const newAmount = dto.amount !== undefined ? new Decimal(dto.amount) : oldAmount;
    const currency = dto.currency ?? existing.currency;

    const { fromAccount } = await this.validateAccounts(userId, newFromId, newToId, currency);

    const balanceChanged = newFromId !== oldFromId || newToId !== oldToId || !newAmount.equals(oldAmount);

    if (balanceChanged) {
      // Available in the new source account once the old transfer is reverted
      let available = fromAccount.balance;
      if (newFromId === oldFromId) available = available.add(oldAmount);
      if (newFromId === oldToId) available = available.sub(oldAmount);

      if (available.lessThan(newAmount)) {
        throw new BadRequestException('Insufficient balance in source account');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (balanceChanged) {
        await adjustBalance(tx, oldFromId, oldAmount);
        await adjustBalance(tx, oldToId, oldAmount.neg());
        await adjustBalance(tx, newFromId, newAmount.neg());
        await adjustBalance(tx, newToId, newAmount);
      }

      return tx.accountMovement.update({
        where: { id },
        data: {
          accountId: newFromId,
          toAccountId: newToId,
          amount: newAmount,
          currency,
          note: dto.note,
          movementDate: dto.date ? new Date(dto.date) : undefined,
        },
        include: movementInclude,
      });
    });

    return toMovementResponseDto(updated);
  }

  private async validateAccounts(userId: string, fromAccountId: string, toAccountId: string, currency: string) {
    if (fromAccountId === toAccountId) {
      throw new BadRequestException('Cannot transfer to the same account');
    }

    const [fromAccount, toAccount] = await Promise.all([
      this.prisma.account.findUnique({ where: { id: fromAccountId } }),
      this.prisma.account.findUnique({ where: { id: toAccountId } }),
    ]);

    if (!fromAccount || fromAccount.userId !== userId) {
      throw new NotFoundException('Source account not found');
    }

    if (!toAccount || toAccount.userId !== userId) {
      throw new NotFoundException('Destination account not found');
    }

    if (fromAccount.currency !== currency || toAccount.currency !== currency) {
      throw new BadRequestException('Currency mismatch between accounts');
    }

    return { fromAccount, toAccount };
  }
}
