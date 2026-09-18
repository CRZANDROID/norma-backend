import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DocumentProcessingStatus,
  JobErrorCode,
  JobRunStatus,
} from '../database/prisma-client';
import { PrismaService } from '../database/prisma.service';
import { CrawlProducer } from './crawl.producer';
import { DocumentJobsProducer } from './document-jobs.producer';
import {
  abandonedCrawlResolution,
  pipelineRequeueAction,
  redisJobIsAbandoned,
} from './job-lifetime';
import { CRAWL_INTERRUPTED_PARTIAL } from './origin-page';

const RECOVERY_LOOKBACK_MS = 48 * 60 * 60 * 1000;
const RECOVERY_DELAY_MS = 5_000;

@Injectable()
export class JobsRecoveryService implements OnModuleInit {
  private readonly logger = new Logger(JobsRecoveryService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly crawls: CrawlProducer,
    private readonly documents: DocumentJobsProducer,
  ) {}

  onModuleInit() {
    if (!this.crawls.workerEnabled()) {
      return;
    }
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    setTimeout(() => {
      void this.recover().catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`jobs recovery failed: ${message}`);
      });
    }, RECOVERY_DELAY_MS);
  }

  async recover(now = new Date()): Promise<void> {
    const since = new Date(now.getTime() - RECOVERY_LOOKBACK_MS);
    await this.recoverAbandonedCrawls(since);
    await this.requeueOrphanDocuments(since);
  }

  private async recoverAbandonedCrawls(since: Date) {
    const runs = await this.prisma.jobRun.findMany({
      where: {
        type: 'source.crawl',
        status: { in: [JobRunStatus.QUEUED, JobRunStatus.RUNNING] },
        updatedAt: { gte: since },
      },
      select: { id: true, idempotencyKey: true, sourceCode: true },
    });
    for (const run of runs) {
      const state = await this.crawls.redisJobState(run.idempotencyKey);
      const saved = await this.prisma.document.count({
        where: { jobRunId: run.id },
      });
      const action = abandonedCrawlResolution(state, saved);
      if (action === 'leave') {
        continue;
      }
      if (action === 'success-partial') {
        await this.prisma.jobRun.update({
          where: { id: run.id },
          data: {
            status: JobRunStatus.SUCCESS,
            message: CRAWL_INTERRUPTED_PARTIAL,
            errorCode: null,
            finishedAt: new Date(),
          },
        });
        this.logger.warn(
          `recovered crawl with pages source=${run.sourceCode} key=${run.idempotencyKey} saved=${saved}`,
        );
        continue;
      }
      await this.prisma.jobRun.update({
        where: { id: run.id },
        data: {
          status: JobRunStatus.FAILED,
          errorCode: JobErrorCode.UNKNOWN,
          message: 'No se pudo completar el rastreo.',
          finishedAt: new Date(),
        },
      });
      this.logger.warn(
        `closed abandoned crawl source=${run.sourceCode} key=${run.idempotencyKey}`,
      );
    }
  }

  private async requeueOrphanDocuments(since: Date) {
    if (!this.documents.isConfigured()) {
      return;
    }
    const rows = await this.prisma.document.findMany({
      where: {
        createdAt: { gte: since },
        processingStatus: {
          in: [
            DocumentProcessingStatus.RECEIVED,
            DocumentProcessingStatus.EXTRACTED,
            DocumentProcessingStatus.NORMALIZED,
            DocumentProcessingStatus.HASHED,
            DocumentProcessingStatus.READY_FOR_AI,
          ],
        },
      },
      select: {
        id: true,
        path: true,
        processingStatus: true,
      },
    });
    let extract = 0;
    let normalize = 0;
    let classify = 0;
    for (const row of rows) {
      const action = pipelineRequeueAction(row.processingStatus);
      if (!action) {
        continue;
      }
      try {
        if (action === 'extract') {
          if (!redisJobIsAbandoned(await this.documents.extractJobState(row.id))) {
            continue;
          }
          const result = await this.documents.enqueueExtract({
            documentId: row.id,
            storagePath: row.path,
          });
          if (result.enqueued) {
            extract += 1;
          }
        } else if (action === 'normalize') {
          if (
            !redisJobIsAbandoned(await this.documents.normalizeJobState(row.id))
          ) {
            continue;
          }
          const result = await this.documents.enqueueNormalize({
            documentId: row.id,
          });
          if (result.enqueued) {
            normalize += 1;
          }
        } else {
          if (
            !redisJobIsAbandoned(await this.documents.classifyJobState(row.id))
          ) {
            continue;
          }
          const result = await this.documents.enqueueClassify({
            documentId: row.id,
          });
          if (result.enqueued) {
            classify += 1;
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `requeue ${action} failed document=${row.id}: ${message}`,
        );
      }
    }
    if (extract + normalize + classify > 0) {
      this.logger.log(
        `requeued orphan documents extract=${extract} normalize=${normalize} classify=${classify}`,
      );
    }
  }
}
