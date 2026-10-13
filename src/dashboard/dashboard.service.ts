import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardResponseDto } from './dto/dashboard-response.dto';
import { Decimal } from '@prisma/client/runtime/library';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getDashboard(userId: string): Promise<DashboardResponseDto> {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const accounts = await this.prisma.account.findMany({
      where: { userId, isActive: true },
      select: { id: true, balance: true },
    });

    const accountIds = accounts.map((a) => a.id);
    const totalBalance = accounts.reduce((sum, account) => sum.add(account.balance), new Decimal(0));

    const monthlyTransactions = await this.prisma.transaction.findMany({
      where: {
        accountId: { in: accountIds },
        transactionDate: { gte: monthStart, lte: monthEnd },
      },
      select: { type: true, amount: true },
    });

    let monthlyIncome = new Decimal(0);
    let monthlyExpenses = new Decimal(0);

    for (const tx of monthlyTransactions) {
      const amount = new Decimal(tx.amount.toString());
      if (tx.type === 'INCOME') {
        monthlyIncome = monthlyIncome.add(amount);
      } else if (tx.type === 'EXPENSE') {
        monthlyExpenses = monthlyExpenses.add(amount);
      }
    }

    const unclassifiedCount = await this.prisma.transaction.count({
      where: {
        accountId: { in: accountIds },
        status: 'UNCLASSIFIED',
      },
    });

    const result = new DashboardResponseDto();
    result.totalBalance = totalBalance.toNumber();
    result.monthlyIncome = monthlyIncome.toNumber();
    result.monthlyExpenses = monthlyExpenses.toNumber();
    result.unclassifiedCount = unclassifiedCount;
    return result;
  }
}