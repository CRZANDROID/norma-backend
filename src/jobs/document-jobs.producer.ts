import {
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { redisJobIsInFlight } from './queue-state';
import {
  DOCUMENT_CLASSIFY_QUEUE,
  DOCUMENT_EXTRACT_QUEUE,
  DOCUMENT_NORMALIZE_QUEUE,
  type DocumentClassifyJob,
  type DocumentExtractJob,
  type DocumentNormalizeJob,
} from './document-jobs.types';

@Injectable()
export class DocumentJobsProducer implements OnModuleDestroy {
  private readonly logger = new Logger(DocumentJobsProducer.name);
  private readonly redis: Redis | null;
  private readonly extractQueue: Queue<DocumentExtractJob> | null;
  private readonly normalizeQueue: Queue<DocumentNormalizeJob> | null;
  private readonly classifyQueue: Queue<DocumentClassifyJob> | null;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('REDIS_URL')?.trim();
    if (!url) {
      this.redis = null;
      this.extractQueue = null;
      this.normalizeQueue = null;
      this.classifyQueue = null;
      return;
    }

    this.redis = new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    this.redis.on('error', (err) => {
      this.logger.warn(`Redis document jobs: ${err.message}`);
    });
    const defaultJobOptions = {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 4000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    };
    this.extractQueue = new Queue<DocumentExtractJob>(DOCUMENT_EXTRACT_QUEUE, {
      connection: this.redis,
      defaultJobOptions,
    });
    this.normalizeQueue = new Queue<DocumentNormalizeJob>(
      DOCUMENT_NORMALIZE_QUEUE,
      { connection: this.redis, defaultJobOptions },
    );
    this.classifyQueue = new Queue<DocumentClassifyJob>(
      DOCUMENT_CLASSIFY_QUEUE,
      { connection: this.redis, defaultJobOptions },
    );
  }

  isConfigured(): boolean {
    return (
      this.extractQueue !== null &&
      this.normalizeQueue !== null &&
      this.classifyQueue !== null
    );
  }

  async onModuleDestroy() {
    await this.extractQueue?.close();
    await this.normalizeQueue?.close();
    await this.classifyQueue?.close();
    this.redis?.disconnect();
  }

  async enqueueExtract(params: {
    documentId: string;
    storagePath: string;
    jobRunId?: string;
    force?: boolean;
  }): Promise<{ enqueued: boolean; skipped: boolean; idempotencyKey: string }> {
    const queue = this.requireExtractQueue();
    const idempotencyKey = `${params.documentId}:extract:v1`;
    const ready = await this.prepareJob(
      queue,
      idempotencyKey,
      params.force === true,
    );
    if (!ready) {
      return { enqueued: false, skipped: true, idempotencyKey };
    }

    const payload: DocumentExtractJob = {
      type: 'document.extract',
      jobId: idempotencyKey,
      documentId: params.documentId,
      storagePath: params.storagePath,
      idempotencyKey,
      jobRunId: params.jobRunId,
    };
    await queue.add('extract', payload, { jobId: idempotencyKey });
    this.logger.log(`enqueued extract document=${params.documentId}`);
    return { enqueued: true, skipped: false, idempotencyKey };
  }

  async enqueueNormalize(params: {
    documentId: string;
    force?: boolean;
  }): Promise<{ enqueued: boolean; skipped: boolean; idempotencyKey: string }> {
    const queue = this.requireNormalizeQueue();
    const idempotencyKey = `${params.documentId}:normalize_dedup:v1`;
    const ready = await this.prepareJob(
      queue,
      idempotencyKey,
      params.force === true,
    );
    if (!ready) {
      return { enqueued: false, skipped: true, idempotencyKey };
    }

    const payload: DocumentNormalizeJob = {
      type: 'document.normalize_dedup',
      jobId: idempotencyKey,
      documentId: params.documentId,
      idempotencyKey,
    };
    await queue.add('normalize', payload, { jobId: idempotencyKey });
    this.logger.log(`enqueued normalize document=${params.documentId}`);
    return { enqueued: true, skipped: false, idempotencyKey };
  }

  async enqueueClassify(params: {
    documentId: string;
    force?: boolean;
  }): Promise<{ enqueued: boolean; skipped: boolean; idempotencyKey: string }> {
    const queue = this.requireClassifyQueue();
    const idempotencyKey = `${params.documentId}:classify:v1`;
    const ready = await this.prepareJob(
      queue,
      idempotencyKey,
      params.force === true,
    );
    if (!ready) {
      return { enqueued: false, skipped: true, idempotencyKey };
    }

    const payload: DocumentClassifyJob = {
      type: 'document.classify',
      jobId: idempotencyKey,
      documentId: params.documentId,
      idempotencyKey,
    };
    await queue.add('classify', payload, { jobId: idempotencyKey });
    this.logger.log(`enqueued classify document=${params.documentId}`);
    return { enqueued: true, skipped: false, idempotencyKey };
  }

  private async prepareJob(
    queue: Queue,
    jobId: string,
    force: boolean,
  ): Promise<boolean> {
    const existing = await queue.getJob(jobId);
    if (!existing) {
      return true;
    }
    const state = await existing.getState();
    if (redisJobIsInFlight(state) && !force) {
      return false;
    }
    try {
      await existing.remove();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`could not remove stale job ${jobId}: ${message}`);
      if (!force) {
        return false;
      }
    }
    return true;
  }

  private requireExtractQueue(): Queue<DocumentExtractJob> {
    if (!this.extractQueue) {
      throw new ServiceUnavailableException(
        'Jobs no configurados. Define REDIS_URL.',
      );
    }
    return this.extractQueue;
  }

  private requireNormalizeQueue(): Queue<DocumentNormalizeJob> {
    if (!this.normalizeQueue) {
      throw new ServiceUnavailableException(
        'Jobs no configurados. Define REDIS_URL.',
      );
    }
    return this.normalizeQueue;
  }

  private requireClassifyQueue(): Queue<DocumentClassifyJob> {
    if (!this.classifyQueue) {
      throw new ServiceUnavailableException(
        'Jobs no configurados. Define REDIS_URL.',
      );
    }
    return this.classifyQueue;
  }
}
