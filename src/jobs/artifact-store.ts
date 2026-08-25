import { Injectable, Logger } from '@nestjs/common';
import { DocumentProcessingStatus, Prisma } from '../database/prisma-client';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../modules/storage/storage.service';
import { isMetaCrawlFilename } from './document-text';
import { appendProcessingHistory } from './processing-history';
import { pathDateParts } from './schedule-window';
import type { SourceCrawlArtifact } from './types';

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'x';
}

@Injectable()
export class ArtifactStore {
  private readonly logger = new Logger(ArtifactStore.name);

  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  buildRawPrefix(params: {
    sourceCode: string;
    timeZone: string;
    idempotencyKey: string;
    attempt: number;
    now?: Date;
  }): string {
    const { year, month, day } = pathDateParts(
      params.now ?? new Date(),
      params.timeZone,
    );
    const key = sanitizeSegment(params.idempotencyKey);
    const attempt = `attempt-${Math.max(1, params.attempt)}`;
    return [
      'raw',
      sanitizeSegment(params.sourceCode),
      year,
      month,
      day,
      key,
      attempt,
    ].join('/');
  }

  async saveRaw(params: {
    sourceId: string;
    sourceCode: string;
    timeZone: string;
    idempotencyKey: string;
    attempt: number;
    filename: string;
    buffer: Buffer;
    contentType: string;
    metadata: Record<string, unknown>;
    externalRef?: string;
  }): Promise<SourceCrawlArtifact> {
    const prefix = this.buildRawPrefix(params);
    const filename = sanitizeSegment(params.filename);
    const objectPath = `${prefix}/${filename}`;

    const uploaded = await this.storage.putObject({
      path: objectPath,
      buffer: params.buffer,
      contentType: params.contentType,
      upsert: true,
    });

    const document = await this.upsertDocument({
      sourceId: params.sourceId,
      bucket: uploaded.bucket,
      path: uploaded.path,
      filename,
      mimeType: params.contentType,
      sizeBytes: uploaded.sizeBytes,
      metadata: {
        kind: 'raw-crawl',
        sourceCode: params.sourceCode,
        idempotencyKey: params.idempotencyKey,
        ...params.metadata,
      },
    });

    return {
      storagePath: uploaded.path,
      contentType: params.contentType,
      byteSize: uploaded.sizeBytes ?? params.buffer.length,
      documentId: document.id,
      externalRef: params.externalRef,
    };
  }

  private async upsertDocument(params: {
    sourceId: string;
    bucket: string;
    path: string;
    filename: string;
    mimeType: string;
    sizeBytes: number | null;
    metadata: Record<string, unknown>;
  }) {
    const discarded =
      params.metadata.kind === 'raw-crawl-meta' ||
      isMetaCrawlFilename(params.filename);
    const processingStatus = discarded
      ? DocumentProcessingStatus.DISCARDED
      : DocumentProcessingStatus.RECEIVED;

    try {
      return await this.prisma.document.create({
        data: {
          sourceId: params.sourceId,
          bucket: params.bucket,
          path: params.path,
          filename: params.filename,
          mimeType: params.mimeType,
          sizeBytes: params.sizeBytes,
          processingStatus,
          processingHistory: appendProcessingHistory(
            [],
            processingStatus,
          ) as unknown as Prisma.InputJsonValue,
          metadata: params.metadata as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const existing = await this.prisma.document.findUnique({
          where: {
            bucket_path: { bucket: params.bucket, path: params.path },
          },
        });
        if (existing) {
          this.logger.log(`artifact already stored path=${params.path}; replacing`);
          return this.prisma.document.update({
            where: { id: existing.id },
            data: {
              mimeType: params.mimeType,
              sizeBytes: params.sizeBytes,
              processingStatus,
              lastError: null,
              extractedText: discarded ? existing.extractedText : null,
              extractedPath: discarded ? existing.extractedPath : null,
              contentHash: discarded ? existing.contentHash : null,
              canonicalDocumentId: discarded
                ? existing.canonicalDocumentId
                : null,
              metadata: params.metadata as Prisma.InputJsonValue,
              processingHistory: appendProcessingHistory(
                existing.processingHistory,
                processingStatus,
              ) as unknown as Prisma.InputJsonValue,
            },
          });
        }
      }
      throw err;
    }
  }
}
