import { TransactionType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Signed effect of a transaction on its account balance: INCOME adds, EXPENSE subtracts.
 * Transfers, openings and adjustments live in account_movements (see src/movements).
 */
export function balanceDelta(type: TransactionType, amount: Decimal): Decimal {
  return type === TransactionType.INCOME ? new Decimal(amount) : new Decimal(amount).neg();
}

/** Atomically adjusts an account balance by `delta` (no read-modify-write). */
export async function adjustBalance(tx: any, accountId: string, delta: Decimal): Promise<void> {
  if (delta.isZero()) return;
  await tx.account.update({
    where: { id: accountId },
    data: { balance: { increment: delta } },
  });
}
