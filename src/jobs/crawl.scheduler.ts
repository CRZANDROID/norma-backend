import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EntityStatus } from '../database/prisma-client';
import { PrismaService } from '../database/prisma.service';
import { CrawlProducer } from './crawl.producer';
import {
  isDueForScheduledCrawl,
  scheduledIdempotencyKey,
} from './schedule-window';

@Injectable()
export class CrawlScheduler {
  private readonly logger = new Logger(CrawlScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly producer: CrawlProducer,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    if (!this.producer.schedulerEnabled()) {
      return;
    }

    const now = new Date();
    const sources = await this.prisma.source.findMany({
      where: { status: EntityStatus.ACTIVE },
    });

    for (const source of sources) {
      if (!isDueForScheduledCrawl(source, now)) {
        continue;
      }

      const idempotencyKey = scheduledIdempotencyKey(
        source.code,
        now,
        source.scheduleTimezone,
      );

      try {
        const result = await this.producer.enqueueResolved({
          source,
          triggeredBy: 'scheduler',
          idempotencyKey,
        });
        if (result.enqueued) {
          this.logger.log(
            `scheduler enqueued source=${source.code} key=${idempotencyKey}`,
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `scheduler skip source=${source.code}: ${message}`,
        );
      }
    }
  }
}
