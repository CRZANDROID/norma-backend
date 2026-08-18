import { Injectable } from '@nestjs/common';
import { EntityStatus, Prisma } from '../database/prisma-client';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../modules/storage/storage.service';
import { listPilotConnectors } from './connectors/registry';
import { CrawlProducer, type EnqueueResult } from './crawl.producer';
import type { ListJobRunsQueryDto } from './dto/list-job-runs.query.dto';
import type { TriggerCrawlDto } from './dto/trigger-crawl.dto';
import { SOURCE_CRAWL_QUEUE } from './types';
import { adminIdempotencyKey } from './schedule-window';

@Injectable()
export class JobsService {
  constructor(
    private readonly producer: CrawlProducer,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async status() {
    const redis = await this.producer.redisStatus();
    return {
      configured: this.producer.isConfigured(),
      redis,
      worker: this.producer.workerEnabled(),
      scheduler: this.producer.schedulerEnabled(),
      queue: SOURCE_CRAWL_QUEUE,
      storage: this.storage.isConfigured() ? 'supabase' : 'local-fallback',
      connectors: listPilotConnectors(),
    };
  }

  trigger(dto: TriggerCrawlDto, userId: string) {
    return this.producer.enqueueSource({
      sourceId: dto.sourceId,
      sourceCode: dto.sourceCode,
      triggeredBy: 'admin',
      requestedByUserId: userId,
    });
  }

  async triggerAll(userId: string) {
    const now = new Date();
    const sources = await this.prisma.source.findMany({
      where: { status: EntityStatus.ACTIVE },
      orderBy: { code: 'asc' },
    });

    const items: EnqueueResult[] = [];
    for (const source of sources) {
      const item = await this.producer.enqueueResolved({
        source,
        triggeredBy: 'admin',
        requestedByUserId: userId,
        idempotencyKey: adminIdempotencyKey(
          source.code,
          now,
          source.scheduleTimezone,
        ),
      });
      items.push(item);
    }

    return {
      enqueued: items.filter((i) => i.enqueued).length,
      skipped: items.filter((i) => i.skipped).length,
      items,
    };
  }

  listRuns(query: ListJobRunsQueryDto) {
    const where: Prisma.JobRunWhereInput = {};
    if (query.sourceCode) {
      where.sourceCode = query.sourceCode;
    }
    if (query.status) {
      where.status = query.status;
    }

    return this.prisma.jobRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 20,
    });
  }
}
