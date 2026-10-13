import { MovementType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { MovementResponseDto } from './dto/movement-response.dto';

/** Include needed by toMovementResponseDto. */
export const movementInclude = {
  account: { select: { id: true, name: true } },
  toAccount: { select: { id: true, name: true } },
} as const;

export interface RecordMovementData {
  userId: string;
  type: MovementType;
  accountId: string;
  toAccountId?: string;
  amount: Decimal;
  balanceBefore?: Decimal;
  balanceAfter?: Decimal;
  currency: string;
  note?: string;
  movementDate?: Date;
}

/**
 * Records an OPENING / ADJUSTMENT / TRANSFER in account_movements.
 * Must run inside the same $transaction that changes accounts.balance.
 */
export function recordMovement(tx: any, data: RecordMovementData) {
  return tx.accountMovement.create({
    data: {
      ...data,
      movementDate: data.movementDate ?? new Date(),
    },
  });
}

export function toMovementResponseDto(movement: {
  id: string;
  type: MovementType;
  amount: Decimal;
  currency: string;
  balanceBefore: Decimal | null;
  balanceAfter: Decimal | null;
  note: string | null;
  movementDate: Date;
  createdAt: Date;
  updatedAt: Date;
  account: { id: string; name: string };
  toAccount: { id: string; name: string } | null;
}): MovementResponseDto {
  return new MovementResponseDto({
    id: movement.id,
    type: movement.type,
    amount: movement.amount.toNumber(),
    currency: movement.currency,
    account: { id: movement.account.id, name: movement.account.name },
    toAccount: movement.toAccount ? { id: movement.toAccount.id, name: movement.toAccount.name } : undefined,
    balanceBefore: movement.balanceBefore?.toNumber(),
    balanceAfter: movement.balanceAfter?.toNumber(),
    note: movement.note ?? undefined,
    movementDate: movement.movementDate,
    createdAt: movement.createdAt,
    updatedAt: movement.updatedAt,
  });
}
