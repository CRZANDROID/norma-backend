import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from './prisma-client';

function datasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    return undefined;
  }
  if (/[?&]connection_limit=/i.test(raw)) {
    return raw;
  }
  const limit = process.env.PRISMA_CONNECTION_LIMIT?.trim() || '8';
  const sep = raw.includes('?') ? '&' : '?';
  return `${raw}${sep}connection_limit=${limit}`;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const url = datasourceUrl();
    super(url ? { datasources: { db: { url } } } : {});
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connection established');
    } catch (error) {
      this.logger.warn(
        `Database unavailable at startup — check DATABASE_URL. ${String(error)}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
