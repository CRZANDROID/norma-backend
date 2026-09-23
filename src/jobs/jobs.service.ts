import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DocumentProcessingStatus,
  EntityStatus,
  JobRunStatus,
  Prisma,
} from '../database/prisma-client';
import { PrismaService } from '../database/prisma.service';
import { OpenAiClientService } from '../modules/ai/openai-client.service';
import { StorageService } from '../modules/storage/storage.service';
import { listPilotConnectors } from './connectors/registry';
import { CrawlProducer, type EnqueueResult } from './crawl.producer';
import { DocumentJobsProducer } from './document-jobs.producer';
import type { ListJobRunsQueryDto } from './dto/list-job-runs.query.dto';
import type { ProgressDateQueryDto } from './dto/progress-date.query.dto';
import type { TriggerCrawlDto } from './dto/trigger-crawl.dto';
import type { TriggerSourcePipelineDto } from './dto/trigger-source-pipeline.dto';
import type { TriggerPipelineDayDto } from './dto/trigger-pipeline-day.dto';
import { listTrackingSources, trackingDaySummary } from './progress-board';
import { appendProcessingHistory } from './processing-history';
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
  zonedDayRange,
} from './schedule-window';
import {
  documentNeedsClassify,
  documentNeedsExtractRetry,
} from './source-pipeline';
import { crawlUrlFromMetadata } from './crawl-min-year';
import {
  DOCUMENT_CLASSIFY_QUEUE,
  DOCUMENT_EXTRACT_QUEUE,
  DOCUMENT_NORMALIZE_QUEUE,
} from './document-jobs.types';
import { SOURCE_CRAWL_QUEUE } from './types';

type PipelineEnqueueItem = {
  documentId: string;
  enqueued: boolean;
  skipped: boolean;
};

type PipelineCounts = {
  total: number;
  enqueued: number;
  skipped: number;
};

@Injectable()
export class JobsService {
  constructor(
    private readonly producer: CrawlProducer,
    private readonly documentJobs: DocumentJobsProducer,
    private readonly openai: OpenAiClientService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async status() {
    const redis = await this.producer.redisStatus();
    const [crawl, documents, crawlConsumers, documentConsumers] =
      await Promise.all([
        this.producer.queueCounts(),
        this.documentJobs.queueCounts(),
        this.producer.consumerCount(),
        this.documentJobs.consumerCounts(),
      ]);
    const consumers = {
      [SOURCE_CRAWL_QUEUE]: crawlConsumers,
      [DOCUMENT_EXTRACT_QUEUE]: documentConsumers.extract,
      [DOCUMENT_NORMALIZE_QUEUE]: documentConsumers.normalize,
      [DOCUMENT_CLASSIFY_QUEUE]: documentConsumers.classify,
    };
    return {
      configured: this.producer.isConfigured(),
      redis,
      worker: crawlConsumers > 0,
      scheduler: this.producer.schedulerEnabled(),
      queue: SOURCE_CRAWL_QUEUE,
      queues: {
        [SOURCE_CRAWL_QUEUE]: crawl,
        [DOCUMENT_EXTRACT_QUEUE]: documents.extract,
        [DOCUMENT_NORMALIZE_QUEUE]: documents.normalize,
        [DOCUMENT_CLASSIFY_QUEUE]: documents.classify,
      },
      consumers,
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

  async triggerExtract(dto: TriggerSourcePipelineDto) {
    this.requireDocumentJobs();
    const { source, date, docs } = await this.loadSourceDayDocs(dto);
    const extract = await this.enqueueExtractForDocs(docs);
    const classify = await this.enqueueClassifyForSource(source.id, docs, {
      requireClients: false,
    });
    return {
      sourceId: source.id,
      sourceCode: source.code,
      date,
      extract,
      classify,
    };
  }

  async triggerClassify(dto: TriggerSourcePipelineDto) {
    this.requireDocumentJobs();
    if (!this.openai.isConfigured()) {
      throw new ServiceUnavailableException(
        'OpenAI no configurado. Define OPENAI_API_KEY.',
      );
    }
    const { source, date, docs } = await this.loadSourceDayDocs(dto);
    const classify = await this.enqueueClassifyForSource(source.id, docs, {
      requireClients: true,
    });
    return {
      sourceId: source.id,
      sourceCode: source.code,
      date,
      ...classify,
    };
  }

  async triggerExtractAll(dto: TriggerPipelineDayDto) {
    this.requireDocumentJobs();
    const { date, sources } = await this.loadActiveSourcesForDay(dto.date);
    const sourcesOut: Array<{
      sourceId: string;
      sourceCode: string;
      extract: PipelineCounts;
      classify: PipelineCounts & { reason?: string };
    }> = [];
    let extractEnqueued = 0;
    let extractSkipped = 0;
    let classifyEnqueued = 0;
    let classifySkipped = 0;
    for (const source of sources) {
      const docs = await this.loadDayDocsForSource(source.id, date);
      const extract = await this.enqueueExtractForDocs(docs);
      const classify = await this.enqueueClassifyForSource(source.id, docs, {
        requireClients: false,
      });
      extractEnqueued += extract.enqueued;
      extractSkipped += extract.skipped;
      classifyEnqueued += classify.enqueued;
      classifySkipped += classify.skipped;
      sourcesOut.push({
        sourceId: source.id,
        sourceCode: source.code,
        extract: {
          total: extract.total,
          enqueued: extract.enqueued,
          skipped: extract.skipped,
        },
        classify: {
          total: classify.total,
          enqueued: classify.enqueued,
          skipped: classify.skipped,
          ...(classify.reason ? { reason: classify.reason } : {}),
        },
      });
    }
    return {
      date,
      extract: { enqueued: extractEnqueued, skipped: extractSkipped },
      classify: { enqueued: classifyEnqueued, skipped: classifySkipped },
      sources: sourcesOut,
    };
  }

  async triggerClassifyAll(dto: TriggerPipelineDayDto) {
    this.requireDocumentJobs();
    if (!this.openai.isConfigured()) {
      throw new ServiceUnavailableException(
        'OpenAI no configurado. Define OPENAI_API_KEY.',
      );
    }
    const { date, sources } = await this.loadActiveSourcesForDay(dto.date);
    const sourcesOut: Array<{
      sourceId: string;
      sourceCode: string;
      total: number;
      enqueued: number;
      skipped: number;
      reason?: string;
    }> = [];
    let enqueued = 0;
    let skipped = 0;
    for (const source of sources) {
      const docs = await this.loadDayDocsForSource(source.id, date);
      const classify = await this.enqueueClassifyForSource(source.id, docs, {
        requireClients: false,
      });
      enqueued += classify.enqueued;
      skipped += classify.skipped;
      sourcesOut.push({
        sourceId: source.id,
        sourceCode: source.code,
        total: classify.total,
        enqueued: classify.enqueued,
        skipped: classify.skipped,
        ...(classify.reason ? { reason: classify.reason } : {}),
      });
    }
    return { date, enqueued, skipped, sources: sourcesOut };
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

    const sourceRows = sources.map((source) => {
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
    });

    return {
      date,
      summary: trackingDaySummary(
        sourceRows.map((row) => row.status),
        ['queued', 'running'],
      ),
      sources: sourceRows,
    };
  }

  private async loadSourceDayDocs(dto: TriggerSourcePipelineDto) {
    const source = await this.producer.resolveSource(
      dto.sourceId,
      dto.sourceCode,
    );
    if (source.status !== EntityStatus.ACTIVE) {
      throw new BadRequestException(
        `La fuente ${source.code} está INACTIVE; no se procesa.`,
      );
    }
    const date = this.requireCalendarDate(dto.date);
    const docs = await this.loadDayDocsForSource(source.id, date);
    return { source, date, docs };
  }

  private async loadActiveSourcesForDay(queryDate?: string) {
    const date = this.requireCalendarDate(queryDate);
    const sources = await this.prisma.source.findMany({
      where: { status: EntityStatus.ACTIVE },
      orderBy: { code: 'asc' },
      select: { id: true, code: true },
    });
    return { date, sources };
  }

  private requireCalendarDate(queryDate?: string) {
    const date = trackingCalendarDate(new Date(), queryDate);
    if (!isValidCalendarDate(date)) {
      throw new BadRequestException('date debe ser un día civil YYYY-MM-DD.');
    }
    return date;
  }

  private loadDayDocsForSource(sourceId: string, date: string) {
    const { start, end } = zonedDayRange(date);
    return this.prisma.document.findMany({
      where: {
        sourceId,
        processingStatus: { not: DocumentProcessingStatus.DISCARDED },
        OR: [
          { createdAt: { gte: start, lt: end } },
          { jobRun: { idempotencyKey: { contains: `:${date}:` } } },
        ],
      },
      include: {
        findings: { select: { clientId: true } },
      },
    });
  }

  private requireDocumentJobs() {
    if (!this.documentJobs.isConfigured()) {
      throw new ServiceUnavailableException(
        'Jobs no configurados. Define REDIS_URL.',
      );
    }
  }

  private async enqueueExtractForDocs(
    docs: Array<{
      id: string;
      filename: string;
      mimeType: string | null;
      path: string;
      canonicalDocumentId: string | null;
      processingStatus: DocumentProcessingStatus;
      lastError: string | null;
      jobRunId: string | null;
      processingHistory: Prisma.JsonValue;
    }>,
  ) {
    const items: PipelineEnqueueItem[] = [];
    for (const doc of docs) {
      if (
        !documentNeedsExtractRetry({
          filename: doc.filename,
          mimeType: doc.mimeType,
          canonicalDocumentId: doc.canonicalDocumentId,
          processingStatus: doc.processingStatus,
          lastError: doc.lastError,
        })
      ) {
        continue;
      }
      await this.prisma.document.update({
        where: { id: doc.id },
        data: {
          processingStatus: DocumentProcessingStatus.RECEIVED,
          lastError: null,
          canonicalDocumentId: null,
          contentHash: null,
          processingHistory: appendProcessingHistory(
            doc.processingHistory,
            DocumentProcessingStatus.RECEIVED,
          ) as unknown as Prisma.InputJsonValue,
        },
      });
      const queued = await this.documentJobs.enqueueExtract({
        documentId: doc.id,
        storagePath: doc.path,
        jobRunId: doc.jobRunId ?? undefined,
        force: true,
      });
      items.push({
        documentId: doc.id,
        enqueued: queued.enqueued,
        skipped: queued.skipped,
      });
    }
    return this.pipelineCounts(items);
  }

  private async enqueueClassifyForSource(
    sourceId: string,
    docs: Array<{
      id: string;
      canonicalDocumentId: string | null;
      processingStatus: DocumentProcessingStatus;
      lastError: string | null;
      extractedText: string | null;
      processingHistory: Prisma.JsonValue;
      findings: Array<{ clientId: string }>;
    }>,
    opts: { requireClients: boolean },
  ): Promise<
    PipelineCounts & { items: PipelineEnqueueItem[]; reason?: string }
  > {
    const links = await this.prisma.clientSource.findMany({
      where: {
        sourceId,
        client: { status: EntityStatus.ACTIVE },
      },
      select: { clientId: true },
    });
    const linkedClientIds = links.map((link) => link.clientId);
    if (linkedClientIds.length === 0) {
      if (opts.requireClients) {
        throw new BadRequestException(
          'La fuente no tiene clientes vinculados; no se analiza.',
        );
      }
      return {
        ...this.pipelineCounts([]),
        items: [] as PipelineEnqueueItem[],
        reason: 'no-clients',
      };
    }
    if (!this.openai.isConfigured()) {
      return {
        ...this.pipelineCounts([]),
        items: [] as PipelineEnqueueItem[],
        reason: 'openai-unconfigured',
      };
    }

    const items: PipelineEnqueueItem[] = [];
    for (const doc of docs) {
      if (
        !documentNeedsClassify({
          canonicalDocumentId: doc.canonicalDocumentId,
          processingStatus: doc.processingStatus,
          lastError: doc.lastError,
          extractedText: doc.extractedText,
          findingClientIds: doc.findings.map((row) => row.clientId),
          linkedClientIds,
          url: crawlUrlFromMetadata(doc.metadata),
          filename: doc.filename,
        })
      ) {
        continue;
      }
      if (doc.processingStatus === DocumentProcessingStatus.FAILED) {
        await this.prisma.document.update({
          where: { id: doc.id },
          data: {
            processingStatus: DocumentProcessingStatus.READY_FOR_AI,
            lastError: null,
            processingHistory: appendProcessingHistory(
              doc.processingHistory,
              DocumentProcessingStatus.READY_FOR_AI,
            ) as unknown as Prisma.InputJsonValue,
          },
        });
      }
      const queued = await this.documentJobs.enqueueClassify({
        documentId: doc.id,
        force: true,
      });
      items.push({
        documentId: doc.id,
        enqueued: queued.enqueued,
        skipped: queued.skipped,
      });
    }
    return { ...this.pipelineCounts(items), items };
  }

  private pipelineCounts(items: PipelineEnqueueItem[]): PipelineCounts & {
    items: PipelineEnqueueItem[];
  } {
    return {
      total: items.length,
      enqueued: items.filter((item) => item.enqueued).length,
      skipped: items.filter((item) => item.skipped).length,
      items,
    };
  }
}
