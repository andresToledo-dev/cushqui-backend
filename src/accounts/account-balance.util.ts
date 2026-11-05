import { BadRequestException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Signed effect of a transaction on its account balance: INCOME adds, EXPENSE subtracts.
 * Transfers, openings and adjustments live in account_movements (see src/movements).
 */
export function balanceDelta(type: TransactionType, amount: Decimal): Decimal {
  return type === TransactionType.INCOME ? new Decimal(amount) : new Decimal(amount).neg();
}

/** A closed account stays at 0: rejects any balance change that touches one of these accounts. */
export async function assertAccountsActive(db: any, accountIds: string[]): Promise<void> {
  const closed = await db.account.count({ where: { id: { in: accountIds }, isActive: false } });
  if (closed > 0) {
    throw new BadRequestException('Account is inactive');
  }
}

/** Atomically adjusts an account balance by `delta` (no read-modify-write). */
export async function adjustBalance(tx: any, accountId: string, delta: Decimal): Promise<void> {
  if (delta.isZero()) return;
  await tx.account.update({
    where: { id: accountId },
    data: { balance: { increment: delta } },
  });
}
