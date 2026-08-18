import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnrecoverableError, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import {
  EntityStatus,
  JobErrorCode,
  JobRunStatus,
  Prisma,
} from '../database/prisma-client';
import { PrismaService } from '../database/prisma.service';
import { ArtifactStore } from './artifact-store';
import { getConnector } from './connectors/registry';
import { SOURCE_CRAWL_QUEUE } from './types';
import { CrawlError } from './types';
import type {
  SourceCrawlFailure,
  SourceCrawlJob,
  SourceCrawlResult,
} from './types';

@Injectable()
export class CrawlProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CrawlProcessor.name);
  private redis: Redis | null = null;
  private worker: Worker<SourceCrawlJob> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly artifacts: ArtifactStore,
  ) {}

  onModuleInit() {
    const url = this.config.get<string>('REDIS_URL')?.trim();
    if (!url) {
      return;
    }
    if (this.config.get<string>('JOBS_WORKER')?.trim() === 'false') {
      this.logger.log('JOBS_WORKER=false — no se arranca el worker');
      return;
    }

    this.redis = new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    this.redis.on('error', (err) => {
      this.logger.warn(`Redis worker: ${err.message}`);
    });

    const concurrency = Number(this.config.get('JOBS_CONCURRENCY') || 2);
    this.worker = new Worker<SourceCrawlJob>(
      SOURCE_CRAWL_QUEUE,
      (job) => this.handle(job),
      { connection: this.redis, concurrency },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `job failed source=${job?.data?.sourceCode} key=${job?.id}: ${err.message}`,
      );
    });
    this.logger.log(`worker source.crawl concurrency=${concurrency}`);
  }

  async onModuleDestroy() {
    await this.worker?.close();
    this.redis?.disconnect();
  }

  private async handle(job: Job<SourceCrawlJob>): Promise<SourceCrawlResult> {
    const payload = job.data;
    const attempt = (job.attemptsMade ?? 0) + 1;
    this.logger.log(
      `crawl start source=${payload.sourceCode} key=${payload.idempotencyKey} sourceId=${payload.sourceId} attempt=${attempt}`,
    );

    const existing = await this.prisma.jobRun.findUnique({
      where: { idempotencyKey: payload.idempotencyKey },
    });
    if (
      existing?.status === JobRunStatus.SUCCESS ||
      existing?.status === JobRunStatus.SKIPPED
    ) {
      this.logger.log(`crawl skip already-completed key=${payload.idempotencyKey}`);
      return (existing.result as SourceCrawlResult) ?? {
        ok: true,
        jobId: payload.jobId,
        sourceId: payload.sourceId,
        artifacts: [],
        stats: { fetched: 0, saved: 0, skipped: 1 },
        finishedAt: existing.finishedAt?.toISOString() ?? new Date().toISOString(),
      };
    }

    await this.prisma.jobRun.update({
      where: { id: payload.jobId },
      data: {
        status: JobRunStatus.RUNNING,
        attempt,
        startedAt: existing?.startedAt ?? new Date(),
        errorCode: null,
        message: null,
      },
    });

    const source = await this.prisma.source.findUnique({
      where: { id: payload.sourceId },
    });
    if (!source) {
      throw await this.fail(
        payload,
        new CrawlError('Fuente no encontrada', 'UNKNOWN', false),
      );
    }
    if (source.status !== EntityStatus.ACTIVE) {
      await this.prisma.jobRun.update({
        where: { id: payload.jobId },
        data: {
          status: JobRunStatus.SKIPPED,
          message: 'Fuente INACTIVE',
          finishedAt: new Date(),
        },
      });
      this.logger.log(`crawl skip INACTIVE source=${source.code}`);
      return {
        ok: true,
        jobId: payload.jobId,
        sourceId: source.id,
        artifacts: [],
        stats: { fetched: 0, saved: 0, skipped: 1 },
        finishedAt: new Date().toISOString(),
      };
    }

    try {
      const connector = getConnector(source.code);
      const fetched = await connector.crawl(source);
      const meta = {
        connector: connector.label,
        connectorCode: connector.code,
        fetchedAt: fetched.page.fetchedAt,
        url: fetched.page.url,
        finalUrl: fetched.page.finalUrl,
        statusCode: fetched.page.statusCode,
        contentType: fetched.page.contentType,
        searchFocus: source.searchFocus,
        notes: source.notes,
        sections: source.sections,
        sourceName: source.name,
      };

      const pageArtifact = await this.artifacts.saveRaw({
        sourceId: source.id,
        sourceCode: source.code,
        timeZone: source.scheduleTimezone,
        idempotencyKey: payload.idempotencyKey,
        attempt,
        filename: fetched.filename,
        buffer: fetched.page.body,
        contentType: fetched.page.contentType,
        externalRef: fetched.page.finalUrl,
        metadata: meta,
      });

      const metaArtifact = await this.artifacts.saveRaw({
        sourceId: source.id,
        sourceCode: source.code,
        timeZone: source.scheduleTimezone,
        idempotencyKey: payload.idempotencyKey,
        attempt,
        filename: 'meta.json',
        buffer: Buffer.from(`${JSON.stringify(meta, null, 2)}\n`),
        contentType: 'application/json',
        externalRef: fetched.page.finalUrl,
        metadata: { kind: 'raw-crawl-meta' },
      });

      const result: SourceCrawlResult = {
        ok: true,
        jobId: payload.jobId,
        sourceId: source.id,
        artifacts: [pageArtifact, metaArtifact],
        stats: { fetched: 1, saved: 2, skipped: 0 },
        finishedAt: new Date().toISOString(),
      };

      await this.prisma.jobRun.update({
        where: { id: payload.jobId },
        data: {
          status: JobRunStatus.SUCCESS,
          result: result as unknown as Prisma.InputJsonValue,
          finishedAt: new Date(),
          errorCode: null,
          message: null,
        },
      });

      this.logger.log(
        `crawl ok source=${source.code} saved=${result.stats.saved} path=${pageArtifact.storagePath}`,
      );
      return result;
    } catch (err) {
      const crawlErr =
        err instanceof CrawlError
          ? err
          : new CrawlError(
              err instanceof Error ? err.message : String(err),
              'UNKNOWN',
              true,
            );
      throw await this.fail(payload, crawlErr);
    }
  }

  private async fail(payload: SourceCrawlJob, err: CrawlError): Promise<Error> {
    const failure: SourceCrawlFailure = {
      ok: false,
      jobId: payload.jobId,
      sourceId: payload.sourceId,
      errorCode: err.errorCode,
      message: err.message,
      retryable: err.retryable,
      finishedAt: new Date().toISOString(),
    };

    await this.prisma.jobRun.update({
      where: { id: payload.jobId },
      data: {
        status: JobRunStatus.FAILED,
        errorCode: err.errorCode as JobErrorCode,
        message: err.message.slice(0, 1000),
        result: failure as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });

    this.logger.error(
      `crawl fail source=${payload.sourceCode} sourceId=${payload.sourceId} code=${err.errorCode} retryable=${err.retryable}: ${err.message}`,
    );

    if (!err.retryable) {
      return new UnrecoverableError(err.message);
    }
    return err;
  }
}
