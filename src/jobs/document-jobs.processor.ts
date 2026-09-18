import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { DocumentProcessingStatus } from '../database/prisma-client';
import { DocumentClassifyService } from './document-classify.service';
import {
  DOCUMENT_CLASSIFY_QUEUE,
  DOCUMENT_EXTRACT_QUEUE,
  DOCUMENT_NORMALIZE_QUEUE,
  type DocumentClassifyJob,
  type DocumentExtractJob,
  type DocumentNormalizeJob,
} from './document-jobs.types';
import { DocumentJobsProducer } from './document-jobs.producer';
import { DocumentPipelineService } from './document-pipeline.service';
import {
  DEFAULT_DOCUMENT_LOCK_MS,
  DEFAULT_QUEUE_CONCURRENCY,
  parsePositiveInt,
  workerLockOptions,
} from './concurrency';
import {
  CLASSIFY_INTERRUPTED,
  EXTRACT_INTERRUPTED,
  isFinalBullMqFailure,
  NORMALIZE_INTERRUPTED,
} from './job-lifetime';

@Injectable()
export class DocumentJobsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentJobsProcessor.name);
  private redis: Redis | null = null;
  private extractWorker: Worker<DocumentExtractJob> | null = null;
  private normalizeWorker: Worker<DocumentNormalizeJob> | null = null;
  private classifyWorker: Worker<DocumentClassifyJob> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly pipeline: DocumentPipelineService,
    private readonly producer: DocumentJobsProducer,
    private readonly classify: DocumentClassifyService,
  ) {}

  onModuleInit() {
    const url = this.config.get<string>('REDIS_URL')?.trim();
    if (!url) {
      return;
    }
    if (this.config.get<string>('JOBS_WORKER')?.trim() === 'false') {
      this.logger.log('JOBS_WORKER=false — no se arrancan workers de documentos');
      return;
    }

    this.redis = new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    this.redis.on('error', (err) => {
      this.logger.warn(`Redis document worker: ${err.message}`);
    });

    const concurrency = parsePositiveInt(
      this.config.get<string>('JOBS_CONCURRENCY'),
      DEFAULT_QUEUE_CONCURRENCY,
    );
    const classifyConcurrency = parsePositiveInt(
      this.config.get<string>('CLASSIFY_CONCURRENCY'),
      concurrency,
    );
    const lockDuration = parsePositiveInt(
      this.config.get<string>('DOCUMENT_LOCK_MS'),
      DEFAULT_DOCUMENT_LOCK_MS,
    );
    const lock = workerLockOptions(lockDuration);
    this.extractWorker = new Worker<DocumentExtractJob>(
      DOCUMENT_EXTRACT_QUEUE,
      (job) => this.handleExtract(job),
      { connection: this.redis, concurrency, ...lock },
    );
    this.normalizeWorker = new Worker<DocumentNormalizeJob>(
      DOCUMENT_NORMALIZE_QUEUE,
      (job) => this.handleNormalize(job),
      { connection: this.redis, concurrency, ...lock },
    );
    this.classifyWorker = new Worker<DocumentClassifyJob>(
      DOCUMENT_CLASSIFY_QUEUE,
      (job) => this.handleClassify(job),
      {
        connection: this.redis,
        concurrency: classifyConcurrency,
        ...lock,
      },
    );
    this.extractWorker.on('failed', (job, err) => {
      this.logger.error(
        `extract failed document=${job?.data?.documentId}: ${err.message}`,
      );
      void this.onExtractFailed(job, err);
    });
    this.normalizeWorker.on('failed', (job, err) => {
      this.logger.error(
        `normalize failed document=${job?.data?.documentId}: ${err.message}`,
      );
      void this.onNormalizeFailed(job, err);
    });
    this.classifyWorker.on('failed', (job, err) => {
      this.logger.error(
        `classify failed document=${job?.data?.documentId}: ${err.message}`,
      );
      void this.onClassifyFailed(job, err);
    });
    this.logger.log(
      `workers document.extract + document.normalize_dedup concurrency=${concurrency} classify=${classifyConcurrency} lockMs=${lockDuration}`,
    );
  }

  async onModuleDestroy() {
    await this.extractWorker?.close();
    await this.normalizeWorker?.close();
    await this.classifyWorker?.close();
    this.redis?.disconnect();
  }

  private async handleExtract(job: Job<DocumentExtractJob>) {
    this.logger.log(`extract start document=${job.data.documentId}`);
    const result = await this.pipeline.extract(job.data.documentId);
    if (result.processingStatus === DocumentProcessingStatus.EXTRACTED) {
      await this.producer.enqueueNormalize({
        documentId: job.data.documentId,
      });
    }
    return result;
  }

  private async handleNormalize(job: Job<DocumentNormalizeJob>) {
    this.logger.log(`normalize start document=${job.data.documentId}`);
    const result = await this.pipeline.normalizeDedup(job.data.documentId);
    if (result.processingStatus === DocumentProcessingStatus.READY_FOR_AI) {
      await this.producer.enqueueClassify({
        documentId: job.data.documentId,
      });
    }
    return result;
  }

  private async handleClassify(job: Job<DocumentClassifyJob>) {
    this.logger.log(`classify start document=${job.data.documentId}`);
    return this.classify.classify(job.data.documentId);
  }

  private async onExtractFailed(
    job: Job<DocumentExtractJob> | undefined,
    err: Error,
  ) {
    const documentId = job?.data?.documentId;
    if (!documentId || !isFinalBullMqFailure(job, err)) {
      return;
    }
    await this.pipeline.failIfStatus(
      documentId,
      [DocumentProcessingStatus.RECEIVED],
      EXTRACT_INTERRUPTED,
    );
  }

  private async onNormalizeFailed(
    job: Job<DocumentNormalizeJob> | undefined,
    err: Error,
  ) {
    const documentId = job?.data?.documentId;
    if (!documentId || !isFinalBullMqFailure(job, err)) {
      return;
    }
    await this.pipeline.failIfStatus(
      documentId,
      [
        DocumentProcessingStatus.EXTRACTED,
        DocumentProcessingStatus.NORMALIZED,
        DocumentProcessingStatus.HASHED,
      ],
      NORMALIZE_INTERRUPTED,
    );
  }

  private async onClassifyFailed(
    job: Job<DocumentClassifyJob> | undefined,
    err: Error,
  ) {
    const documentId = job?.data?.documentId;
    if (!documentId || !isFinalBullMqFailure(job, err)) {
      return;
    }
    await this.classify.failIfClassifying(documentId, CLASSIFY_INTERRUPTED);
  }
}
