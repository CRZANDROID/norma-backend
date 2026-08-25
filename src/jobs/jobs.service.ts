import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityStatus, JobRunStatus, Prisma } from '../database/prisma-client';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../modules/storage/storage.service';
import { listPilotConnectors } from './connectors/registry';
import { CrawlProducer, type EnqueueResult } from './crawl.producer';
import type { ListJobRunsQueryDto } from './dto/list-job-runs.query.dto';
import type { ProgressDateQueryDto } from './dto/progress-date.query.dto';
import type { TriggerCrawlDto } from './dto/trigger-crawl.dto';
import { listTrackingSources } from './progress-board';
import {
  crawlProgressFromRunStatus,
  crawlProgressLabel,
  crawlProgressNote,
  type CrawlProgressStatus,
} from './progress.labels';
import {
  adminIdempotencyKey,
  isValidCalendarDate,
  trackingCalendarDate,
} from './schedule-window';
import { SOURCE_CRAWL_QUEUE } from './types';

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

  async progress(query: ProgressDateQueryDto) {
    const date = trackingCalendarDate(new Date(), query.date);
    if (!isValidCalendarDate(date)) {
      throw new BadRequestException('date debe ser un día civil YYYY-MM-DD.');
    }

    const sources = await listTrackingSources(this.prisma);
    const sourceIds = sources.map((s) => s.id);
    const runs =
      sourceIds.length === 0
        ? []
        : await this.prisma.jobRun.findMany({
            where: {
              sourceId: { in: sourceIds },
              idempotencyKey: { contains: `:${date}:` },
            },
            orderBy: { createdAt: 'desc' },
          });

    const latestBySource = new Map<string, (typeof runs)[number]>();
    const failedSourceIds = new Set<string>();
    for (const run of runs) {
      if (!run.sourceId) {
        continue;
      }
      if (run.status === JobRunStatus.FAILED) {
        failedSourceIds.add(run.sourceId);
      }
      if (!latestBySource.has(run.sourceId)) {
        latestBySource.set(run.sourceId, run);
      }
    }

    return {
      date,
      sources: sources.map((source) => {
        const run = latestBySource.get(source.id);
        const status: CrawlProgressStatus = run
          ? crawlProgressFromRunStatus(run.status)
          : 'pending';
        const hadFailedAttempt =
          failedSourceIds.has(source.id) && status !== 'failed';
        return {
          sourceId: source.id,
          sourceName: source.name,
          status,
          label: crawlProgressLabel(status),
          at: run
            ? (run.finishedAt ?? run.startedAt ?? run.createdAt).toISOString()
            : null,
          note: crawlProgressNote(status, run?.message, run?.errorCode, {
            hadFailedAttempt,
          }),
          ...(run ? { detail: { jobRunId: run.id } } : {}),
        };
      }),
    };
  }
}
