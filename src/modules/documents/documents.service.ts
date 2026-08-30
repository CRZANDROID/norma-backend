import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DocumentProcessingStatus,
  Prisma,
} from '../../database/prisma-client';
import { PrismaService } from '../../database/prisma.service';
import { PILOT_CONNECTOR_CODES } from '../../jobs/connectors/registry';
import { DocumentJobsProducer } from '../../jobs/document-jobs.producer';
import type { ProgressDateQueryDto } from '../../jobs/dto/progress-date.query.dto';
import { isExtractableCrawlFile, isMetaCrawlFilename } from '../../jobs/document-text';
import { listTrackingSources } from '../../jobs/progress-board';
import { appendProcessingHistory } from '../../jobs/processing-history';
import {
  isValidCalendarDate,
  trackingCalendarDate,
  zonedDayRange,
} from '../../jobs/schedule-window';
import type { ListDocumentsQueryDto } from './dto/list-documents.query.dto';
import {
  documentDaySignals,
  documentHeadline,
  documentPipelineRank,
  documentProgressLabel,
  documentProgressNote,
  mapDocumentPipelineStatus,
  preferHtmlFilename,
  type DocumentProgressStatus,
} from './progress.labels';

const LIST_SELECT = {
  id: true,
  sourceId: true,
  filename: true,
  mimeType: true,
  processingStatus: true,
  contentHash: true,
  canonicalDocumentId: true,
  lastError: true,
  jobRunId: true,
  extractedText: true,
  extractedPath: true,
  normalizedPath: true,
  processingHistory: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  source: { select: { code: true, name: true } },
} satisfies Prisma.DocumentSelect;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentJobs: DocumentJobsProducer,
  ) {}

  async list(query: ListDocumentsQueryDto) {
    const where: Prisma.DocumentWhereInput = {
      filename: { not: 'meta.json' },
    };

    if (query.processingStatus) {
      where.processingStatus = query.processingStatus;
    } else {
      where.processingStatus = { not: DocumentProcessingStatus.DISCARDED };
    }

    if (query.sourceId) {
      where.sourceId = query.sourceId;
    } else if (query.sourceCode) {
      where.source = { code: query.sourceCode };
    } else if (query.pilotOnly) {
      where.source = { code: { in: [...PILOT_CONNECTOR_CODES] } };
    }

    if (query.date) {
      const date = trackingCalendarDate(new Date(), query.date);
      if (!isValidCalendarDate(date)) {
        throw new BadRequestException('date debe ser un día civil YYYY-MM-DD.');
      }
      const { start, end } = zonedDayRange(date);
      where.OR = [
        { createdAt: { gte: start, lt: end } },
        {
          jobRun: {
            idempotencyKey: { contains: `:${date}:` },
          },
        },
      ];
    }

    const rows = await this.prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 20,
      select: LIST_SELECT,
    });

    return rows.map((row) => this.toListItem(row));
  }

  async progress(query: ProgressDateQueryDto) {
    const date = trackingCalendarDate(new Date(), query.date);
    if (!isValidCalendarDate(date)) {
      throw new BadRequestException('date debe ser un día civil YYYY-MM-DD.');
    }

    const { start, end } = zonedDayRange(date);
    const sources = await listTrackingSources(this.prisma);
    const sourceIds = sources.map((s) => s.id);
    const rows =
      sourceIds.length === 0
        ? []
        : await this.prisma.document.findMany({
            where: {
              sourceId: { in: sourceIds },
              processingStatus: { not: DocumentProcessingStatus.DISCARDED },
              OR: [
                { createdAt: { gte: start, lt: end } },
                {
                  jobRun: {
                    idempotencyKey: { contains: `:${date}:` },
                  },
                },
              ],
            },
            select: {
              id: true,
              sourceId: true,
              filename: true,
              mimeType: true,
              processingStatus: true,
              lastError: true,
              extractedText: true,
              canonicalDocumentId: true,
              createdAt: true,
            },
          });

    const bySource = new Map<string, (typeof rows)[number][]>();
    for (const row of rows) {
      if (
        !row.sourceId ||
        isMetaCrawlFilename(row.filename) ||
        !isExtractableCrawlFile(row.filename, row.mimeType)
      ) {
        continue;
      }
      const list = bySource.get(row.sourceId) ?? [];
      list.push(row);
      bySource.set(row.sourceId, list);
    }

    const bestBySource = new Map<string, (typeof rows)[number]>();
    for (const [sourceId, list] of bySource) {
      let best = list[0];
      for (const row of list.slice(1)) {
        if (this.isBetterProgressDocument(row, best)) {
          best = row;
        }
      }
      bestBySource.set(sourceId, best);
    }

    const canonicalIds = [
      ...new Set(
        [...bestBySource.values()]
          .map((row) => row.canonicalDocumentId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const canonicalText = new Map<string, string | null>();
    if (canonicalIds.length) {
      const canons = await this.prisma.document.findMany({
        where: { id: { in: canonicalIds } },
        select: { id: true, extractedText: true },
      });
      for (const canon of canons) {
        canonicalText.set(canon.id, canon.extractedText);
      }
    }

    return {
      date,
      sources: sources.map((source) => {
        const dayRows = bySource.get(source.id) ?? [];
        const row = bestBySource.get(source.id);
        if (!row) {
          const status: DocumentProgressStatus = 'pending';
          return {
            sourceId: source.id,
            sourceName: source.name,
            status,
            label: documentProgressLabel(status),
            headline: null,
            note: null,
          };
        }

        const status = mapDocumentPipelineStatus(
          row.processingStatus,
          row.lastError,
        );
        const signals = documentDaySignals(dayRows);
        const text =
          row.extractedText ||
          (row.canonicalDocumentId
            ? canonicalText.get(row.canonicalDocumentId)
            : null);
        return {
          sourceId: source.id,
          sourceName: source.name,
          status,
          label: documentProgressLabel(status),
          headline: documentHeadline(text),
          note: documentProgressNote(status, row.lastError, signals),
        };
      }),
    };
  }

  private isBetterProgressDocument(
    candidate: {
      filename: string;
      processingStatus: DocumentProcessingStatus;
      createdAt: Date;
    },
    current: {
      filename: string;
      processingStatus: DocumentProcessingStatus;
      createdAt: Date;
    },
  ): boolean {
    const rankDelta =
      documentPipelineRank(candidate.processingStatus) -
      documentPipelineRank(current.processingStatus);
    if (rankDelta !== 0) {
      return rankDelta > 0;
    }
    const htmlDelta =
      preferHtmlFilename(candidate.filename) -
      preferHtmlFilename(current.filename);
    if (htmlDelta !== 0) {
      return htmlDelta > 0;
    }
    return candidate.createdAt > current.createdAt;
  }

  async findOne(id: string) {
    const row = await this.prisma.document.findUnique({
      where: { id },
      select: LIST_SELECT,
    });
    if (!row || isMetaCrawlFilename(row.filename)) {
      throw new NotFoundException('Documento no encontrado.');
    }
    return this.toDetail(row);
  }

  async reprocess(id: string) {
    const row = await this.prisma.document.findUnique({
      where: { id },
    });
    if (!row || isMetaCrawlFilename(row.filename)) {
      throw new NotFoundException('Documento no encontrado.');
    }
    if (!isExtractableCrawlFile(row.filename, row.mimeType)) {
      throw new NotFoundException('El documento no es HTML/PDF extraíble.');
    }
    if (!this.documentJobs.isConfigured()) {
      throw new ServiceUnavailableException(
        'Jobs no configurados. Define REDIS_URL.',
      );
    }

    await this.prisma.document.update({
      where: { id: row.id },
      data: {
        processingStatus: DocumentProcessingStatus.RECEIVED,
        lastError: null,
        canonicalDocumentId: null,
        contentHash: null,
        processingHistory: appendProcessingHistory(
          row.processingHistory,
          DocumentProcessingStatus.RECEIVED,
        ) as unknown as Prisma.InputJsonValue,
      },
    });

    const queued = await this.documentJobs.enqueueExtract({
      documentId: row.id,
      storagePath: row.path,
      jobRunId: row.jobRunId ?? undefined,
      force: true,
    });

    return {
      id: row.id,
      processingStatus: DocumentProcessingStatus.RECEIVED,
      ...queued,
    };
  }

  private toListItem(row: Prisma.DocumentGetPayload<{ select: typeof LIST_SELECT }>) {
    const metadata = asRecord(row.metadata);
    const extracted = row.extractedText ?? '';
    const preview = extracted.replace(/\s+/g, ' ').trim().slice(0, 240);
    return {
      id: row.id,
      sourceId: row.sourceId,
      sourceCode: row.source?.code ?? stringField(metadata, 'sourceCode'),
      sourceName: row.source?.name ?? null,
      filename: row.filename,
      mimeType: row.mimeType,
      processingStatus: row.processingStatus,
      contentHash: row.contentHash,
      canonicalDocumentId: row.canonicalDocumentId,
      lastError: row.lastError,
      jobRunId: row.jobRunId,
      textPreview: preview || null,
      url:
        stringField(metadata, 'finalUrl') ??
        stringField(metadata, 'url') ??
        null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toDetail(row: Prisma.DocumentGetPayload<{ select: typeof LIST_SELECT }>) {
    const metadata = asRecord(row.metadata);
    return {
      ...this.toListItem(row),
      extractedText: row.extractedText,
      extractedPath: row.extractedPath,
      normalizedPath: row.normalizedPath,
      processingHistory: row.processingHistory,
      fetchedAt: stringField(metadata, 'fetchedAt'),
    };
  }
}

function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function stringField(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : null;
}
