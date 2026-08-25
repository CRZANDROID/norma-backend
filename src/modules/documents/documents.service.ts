import {
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
import { isExtractableCrawlFile, isMetaCrawlFilename } from '../../jobs/document-text';
import { appendProcessingHistory } from '../../jobs/processing-history';
import type { ListDocumentsQueryDto } from './dto/list-documents.query.dto';

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

    if (query.sourceCode) {
      where.source = { code: query.sourceCode };
    } else if (query.pilotOnly) {
      where.source = { code: { in: [...PILOT_CONNECTOR_CODES] } };
    }

    const rows = await this.prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 20,
      select: LIST_SELECT,
    });

    return rows.map((row) => this.toListItem(row));
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
      url:
        stringField(metadata, 'finalUrl') ??
        stringField(metadata, 'url') ??
        null,
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
