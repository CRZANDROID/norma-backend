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
import {
  DOCUMENT_EXTRACT_QUEUE,
  DOCUMENT_NORMALIZE_QUEUE,
  type DocumentExtractJob,
  type DocumentNormalizeJob,
} from './document-jobs.types';
import { DocumentJobsProducer } from './document-jobs.producer';
import { DocumentPipelineService } from './document-pipeline.service';

@Injectable()
export class DocumentJobsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentJobsProcessor.name);
  private redis: Redis | null = null;
  private extractWorker: Worker<DocumentExtractJob> | null = null;
  private normalizeWorker: Worker<DocumentNormalizeJob> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly pipeline: DocumentPipelineService,
    private readonly producer: DocumentJobsProducer,
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

    const concurrency = Number(this.config.get('JOBS_CONCURRENCY') || 2);
    this.extractWorker = new Worker<DocumentExtractJob>(
      DOCUMENT_EXTRACT_QUEUE,
      (job) => this.handleExtract(job),
      { connection: this.redis, concurrency },
    );
    this.normalizeWorker = new Worker<DocumentNormalizeJob>(
      DOCUMENT_NORMALIZE_QUEUE,
      (job) => this.handleNormalize(job),
      { connection: this.redis, concurrency },
    );
    this.extractWorker.on('failed', (job, err) => {
      this.logger.error(
        `extract failed document=${job?.data?.documentId}: ${err.message}`,
      );
    });
    this.normalizeWorker.on('failed', (job, err) => {
      this.logger.error(
        `normalize failed document=${job?.data?.documentId}: ${err.message}`,
      );
    });
    this.logger.log(
      `workers document.extract + document.normalize_dedup concurrency=${concurrency}`,
    );
  }

  async onModuleDestroy() {
    await this.extractWorker?.close();
    await this.normalizeWorker?.close();
    this.redis?.disconnect();
  }

  private async handleExtract(job: Job<DocumentExtractJob>) {
    const result = await this.pipeline.extract(job.data.documentId);
    if (result.processingStatus === DocumentProcessingStatus.EXTRACTED) {
      await this.producer.enqueueNormalize({
        documentId: job.data.documentId,
      });
    }
    return result;
  }

  private async handleNormalize(job: Job<DocumentNormalizeJob>) {
    return this.pipeline.normalizeDedup(job.data.documentId);
  }
}
