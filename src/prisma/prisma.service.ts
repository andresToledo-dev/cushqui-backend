import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      // Defaults (maxWait 2s, timeout 5s) are too tight for the Supabase pooler, whose latency spikes
      // made $transaction fail with P2028 before writing anything. Waiting longer opens no extra
      // connections; timeout still releases a stuck transaction's connection.
      transactionOptions: { maxWait: 10_000, timeout: 20_000 },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('cleanDatabase is not allowed in production');
    }

    const models = Reflect.ownKeys(this).filter(
      (key) => typeof key === 'string' && !key.startsWith('_') && !key.startsWith('$'),
    );

    for (const model of models) {
      const modelName = model as string;
      const modelDelegate = (this as any)[modelName];
      if (typeof modelDelegate?.deleteMany === 'function') {
        await modelDelegate.deleteMany();
      }
    }
  }
}