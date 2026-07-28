import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from './prisma-client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

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
