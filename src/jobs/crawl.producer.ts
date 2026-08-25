import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { EntityStatus, Prisma } from '../database/prisma-client';
import { PrismaService } from '../database/prisma.service';
import { SOURCE_CRAWL_QUEUE } from './types';
import type { CrawlTriggeredBy, SourceCrawlJob } from './types';
import { redisJobIsInFlight } from './queue-state';
import {
  adminIdempotencyKey,
  scheduledIdempotencyKey,
} from './schedule-window';

export type EnqueueResult = {
  enqueued: boolean;
  skipped: boolean;
  reason?: string;
  idempotencyKey: string;
  jobRunId: string;
  sourceId: string;
  sourceCode: string;
};

@Injectable()
export class CrawlProducer implements OnModuleDestroy {
  private readonly logger = new Logger(CrawlProducer.name);
  private readonly redis: Redis | null;
  private readonly queue: Queue<SourceCrawlJob> | null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const url = this.config.get<string>('REDIS_URL')?.trim();
    if (!url) {
      this.redis = null;
      this.queue = null;
      return;
    }

    this.redis = new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    this.redis.on('error', (err) => {
      this.logger.warn(`Redis: ${err.message}`);
    });
    this.queue = new Queue<SourceCrawlJob>(SOURCE_CRAWL_QUEUE, {
      connection: this.redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    });
  }

  isConfigured(): boolean {
    return this.queue !== null;
  }

  workerEnabled(): boolean {
    return (
      this.isConfigured() &&
      this.config.get<string>('JOBS_WORKER')?.trim() !== 'false'
    );
  }

  schedulerEnabled(): boolean {
    if (!this.isConfigured()) {
      return false;
    }
    const flag = this.config.get<string>('JOBS_SCHEDULER')?.trim();
    if (flag === 'false') {
      return false;
    }
    // Local/test: solo si se pide explícito. Staging/prod: on salvo JOBS_SCHEDULER=false.
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.NODE_ENV === 'development'
    ) {
      return flag === 'true';
    }
    return true;
  }

  async redisStatus(): Promise<'up' | 'down' | 'disabled'> {
    if (!this.redis) {
      return 'disabled';
    }
    try {
      const result = await Promise.race([
        this.redis.ping(),
        new Promise<string>((resolve) =>
          setTimeout(() => resolve('timeout'), 1500),
        ),
      ]);
      return result === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }

  async onModuleDestroy() {
    await this.queue?.close();
    if (this.redis) {
      this.redis.disconnect();
    }
  }

  async enqueueSource(params: {
    sourceId?: string;
    sourceCode?: string;
    triggeredBy: CrawlTriggeredBy;
    requestedByUserId?: string;
  }): Promise<EnqueueResult> {
    const source = await this.resolveSource(params.sourceId, params.sourceCode);
    if (source.status !== EntityStatus.ACTIVE) {
      throw new BadRequestException(
        `La fuente ${source.code} está INACTIVE; no se crawlea.`,
      );
    }

    const now = new Date();
    const idempotencyKey =
      params.triggeredBy === 'admin'
        ? adminIdempotencyKey(source.code, now, source.scheduleTimezone)
        : scheduledIdempotencyKey(source.code, now, source.scheduleTimezone);

    return this.enqueueResolved({
      source,
      triggeredBy: params.triggeredBy,
      requestedByUserId: params.requestedByUserId,
      idempotencyKey,
    });
  }

  async enqueueResolved(params: {
    source: {
      id: string;
      code: string;
      status: EntityStatus;
    };
    triggeredBy: CrawlTriggeredBy;
    requestedByUserId?: string;
    idempotencyKey: string;
  }): Promise<EnqueueResult> {
    const queue = this.getQueue();
    const { source, idempotencyKey } = params;

    const existing = await this.prisma.jobRun.findUnique({
      where: { idempotencyKey },
    });

    if (existing?.status === 'SUCCESS' || existing?.status === 'SKIPPED') {
      return {
        enqueued: false,
        skipped: true,
        reason: 'already-completed',
        idempotencyKey,
        jobRunId: existing.id,
        sourceId: source.id,
        sourceCode: source.code,
      };
    }

    const redisJob = await queue.getJob(idempotencyKey);
    const redisState = redisJob ? await redisJob.getState() : null;
    const inFlight = redisJobIsInFlight(redisState);

    if (inFlight) {
      return {
        enqueued: false,
        skipped: true,
        reason: 'already-in-flight',
        idempotencyKey,
        jobRunId: existing?.id ?? '',
        sourceId: source.id,
        sourceCode: source.code,
      };
    }

    // Same-day scheduled crawl already failed: do not hammer the origin every minute.
    if (existing?.status === 'FAILED' && params.triggeredBy === 'scheduler') {
      return {
        enqueued: false,
        skipped: true,
        reason: 'already-failed',
        idempotencyKey,
        jobRunId: existing.id,
        sourceId: source.id,
        sourceCode: source.code,
      };
    }

    // Failed/orphaned QUEUED jobs keep the BullMQ id; remove so add() can run again.
    if (redisJob) {
      try {
        await redisJob.remove();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `could not remove stale redis job source=${source.code} key=${idempotencyKey}: ${message}`,
        );
      }
    }

    const run =
      existing ??
      (await this.prisma.jobRun.create({
        data: {
          idempotencyKey,
          type: 'source.crawl',
          sourceId: source.id,
          sourceCode: source.code,
          triggeredBy: params.triggeredBy,
          requestedByUserId: params.requestedByUserId,
          status: 'QUEUED',
        },
      }));

    if (existing) {
      await this.prisma.jobRun.update({
        where: { id: run.id },
        data: {
          status: 'QUEUED',
          errorCode: null,
          message: null,
          triggeredBy: params.triggeredBy,
          requestedByUserId: params.requestedByUserId,
          finishedAt: null,
          result: Prisma.DbNull,
        },
      });
    }

    const payload: SourceCrawlJob = {
      jobId: run.id,
      type: 'source.crawl',
      sourceId: source.id,
      sourceCode: source.code,
      enqueuedAt: new Date().toISOString(),
      idempotencyKey,
      triggeredBy: params.triggeredBy,
      requestedByUserId: params.requestedByUserId,
    };

    try {
      await queue.add('crawl', payload, { jobId: idempotencyKey });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/already exists|duplicat/i.test(message)) {
        const occupied = await queue.getJob(idempotencyKey);
        const occupiedState = occupied ? await occupied.getState() : null;
        if (redisJobIsInFlight(occupiedState)) {
          return {
            enqueued: false,
            skipped: true,
            reason: 'already-in-queue',
            idempotencyKey,
            jobRunId: run.id,
            sourceId: source.id,
            sourceCode: source.code,
          };
        }
        try {
          await occupied?.remove();
          await queue.add('crawl', payload, { jobId: idempotencyKey });
        } catch (retryErr) {
          const retryMessage =
            retryErr instanceof Error ? retryErr.message : String(retryErr);
          this.logger.error(
            `enqueue retry failed source=${source.code} key=${idempotencyKey}: ${retryMessage}`,
          );
          throw new ServiceUnavailableException(
            `No se pudo encolar el crawl (${retryMessage}).`,
          );
        }
      } else {
        this.logger.error(
          `enqueue failed source=${source.code} key=${idempotencyKey}: ${message}`,
        );
        if (existing?.status === 'FAILED') {
          await this.prisma.jobRun.update({
            where: { id: run.id },
            data: { status: 'FAILED', message: existing.message },
          });
        }
        throw new ServiceUnavailableException(
          `No se pudo encolar el crawl (${message}).`,
        );
      }
    }

    this.logger.log(
      `enqueued source=${source.code} key=${idempotencyKey} sourceId=${source.id}`,
    );

    return {
      enqueued: true,
      skipped: false,
      idempotencyKey,
      jobRunId: run.id,
      sourceId: source.id,
      sourceCode: source.code,
    };
  }

  private getQueue(): Queue<SourceCrawlJob> {
    if (!this.queue) {
      throw new ServiceUnavailableException(
        'Jobs no configurados. Define REDIS_URL.',
      );
    }
    return this.queue;
  }

  private async resolveSource(sourceId?: string, sourceCode?: string) {
    if (!sourceId && !sourceCode) {
      throw new BadRequestException('Indica sourceId o sourceCode.');
    }
    const source = sourceId
      ? await this.prisma.source.findUnique({ where: { id: sourceId } })
      : await this.prisma.source.findUnique({
          where: { code: sourceCode! },
        });
    if (!source) {
      throw new NotFoundException('Fuente no encontrada.');
    }
    return source;
  }
}
