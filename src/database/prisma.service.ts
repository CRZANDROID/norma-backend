import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { describeDatabaseUrl, withPrismaRuntimeUrl } from './database-url';
import { PrismaClient } from './prisma-client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly datasourceHost: string;

  constructor() {
    const url = withPrismaRuntimeUrl(process.env.DATABASE_URL);
    super(url ? { datasourceUrl: url } : undefined);
    this.datasourceHost = describeDatabaseUrl(url);
  }

  async onModuleInit() {
    this.logger.log(`Prisma datasource ${this.datasourceHost}`);
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
