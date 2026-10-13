import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StatisticsQueryDto } from './dto/statistics-query.dto';
import { CategoryStatDto, AccountStatDto, MonthlyStatDto } from './dto/statistics-response.dto';
import { Decimal } from '@prisma/client/runtime/library';
import { startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from 'date-fns';

@Injectable()
export class StatisticsService {
  constructor(private prisma: PrismaService) {}

  async getCategoriesStats(userId: string, query: StatisticsQueryDto): Promise<CategoryStatDto[]> {
    const accounts = await this.prisma.account.findMany({
      where: { userId, isActive: true },
      select: { id: true },
    });

    const accountIds = accounts.map((a) => a.id);

    const where: any = {
      accountId: { in: accountIds },
      type: 'EXPENSE',
      categoryId: { not: null },
    };

    if (query.from || query.to) {
      where.transactionDate = {
        ...(query.from && { gte: new Date(query.from) }),
        ...(query.to && { lte: new Date(query.to) }),
      };
    }

    const transactions = await this.prisma.transaction.findMany({
      where,
      include: { category: true },
    });

    const categoryMap = new Map<string, { name: string; total: Decimal }>();

    for (const tx of transactions) {
      const categoryName = tx.category?.name ?? 'Sin categoría';
      const amount = new Decimal(tx.amount.toString());

      if (categoryMap.has(categoryName)) {
        categoryMap.get(categoryName)!.total = categoryMap.get(categoryName)!.total.add(amount);
      } else {
        categoryMap.set(categoryName, { name: categoryName, total: amount });
      }
    }

    const total = Array.from(categoryMap.values()).reduce((sum, c) => sum.add(c.total), new Decimal(0));

    return Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        amount: data.total.toNumber(),
        percentage: total.isZero() ? 0 : Number((data.total.div(total).mul(100)).toFixed(1)),
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  async getAccountsStats(userId: string, query: StatisticsQueryDto): Promise<AccountStatDto[]> {
    const accounts = await this.prisma.account.findMany({
      where: { userId, isActive: true },
      select: { id: true, name: true, balance: true },
    });

    const where: any = {
      accountId: { in: accounts.map((a) => a.id) },
    };

    if (query.from || query.to) {
      where.transactionDate = {
        ...(query.from && { gte: new Date(query.from) }),
        ...(query.to && { lte: new Date(query.to) }),
      };
    }

    const transactions = await this.prisma.transaction.findMany({
      where,
      select: { accountId: true, type: true, amount: true },
    });

    const accountStats = new Map<string, { income: Decimal; expenses: Decimal }>();

    for (const account of accounts) {
      accountStats.set(account.id, { income: new Decimal(0), expenses: new Decimal(0) });
    }

    for (const tx of transactions) {
      const stats = accountStats.get(tx.accountId);
      if (!stats) continue;

      const amount = new Decimal(tx.amount.toString());
      if (tx.type === 'INCOME') {
        stats.income = stats.income.add(amount);
      } else if (tx.type === 'EXPENSE') {
        stats.expenses = stats.expenses.add(amount);
      }
    }

    return accounts.map((account) => {
      const stats = accountStats.get(account.id)!;

      return {
        account: account.name,
        income: stats.income.toNumber(),
        expenses: stats.expenses.toNumber(),
        balance: account.balance.toNumber(),
      };
    });
  }

  async getMonthlyStats(userId: string, query: StatisticsQueryDto): Promise<MonthlyStatDto[]> {
    const accounts = await this.prisma.account.findMany({
      where: { userId, isActive: true },
      select: { id: true },
    });

    const accountIds = accounts.map((a) => a.id);

    const now = new Date();
    const months: MonthlyStatDto[] = [];

    for (let i = 11; i >= 0; i--) {
      const monthDate = subMonths(now, i);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);

      const transactions = await this.prisma.transaction.findMany({
        where: {
          accountId: { in: accountIds },
          transactionDate: { gte: monthStart, lte: monthEnd },
        },
        select: { type: true, amount: true },
      });

      let income = new Decimal(0);
      let expenses = new Decimal(0);

      for (const tx of transactions) {
        const amount = new Decimal(tx.amount.toString());
        if (tx.type === 'INCOME') {
          income = income.add(amount);
        } else if (tx.type === 'EXPENSE') {
          expenses = expenses.add(amount);
        }
      }

      months.push({
        month: monthDate.toISOString().substring(0, 7),
        income: income.toNumber(),
        expenses: expenses.toNumber(),
        net: income.sub(expenses).toNumber(),
      });
    }

    return months;
  }
}