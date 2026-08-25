import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DocumentProcessingStatus,
  Prisma,
} from '../database/prisma-client';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../modules/storage/storage.service';
import {
  derivedExtractedPath,
  derivedNormalizedPath,
  extractPdfText,
  extractVisibleHtmlText,
  isPdfContent,
  sha256Normalized,
  validateExtractedText,
  type NormalizedDocumentFicha,
} from './document-text';
import { appendProcessingHistory } from './processing-history';

export type PipelineStepResult = {
  documentId: string;
  processingStatus: DocumentProcessingStatus;
  contentHash?: string | null;
  canonicalDocumentId?: string | null;
};

@Injectable()
export class DocumentPipelineService {
  private readonly logger = new Logger(DocumentPipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async extract(documentId: string): Promise<PipelineStepResult> {
    const doc = await this.requireDocument(documentId);
    try {
      const object = await this.storage.getObject(doc.path);
      const mime = doc.mimeType || object.contentType;
      let extracted: string;

      if (isPdfContent(doc.filename, mime)) {
        extracted = await extractPdfText(object.data);
      } else {
        extracted = extractVisibleHtmlText(object.data.toString('utf8'));
      }

      const rawAsText = object.data.toString('utf8');
      const check = validateExtractedText(rawAsText, extracted);
      if (!check.ok) {
        return this.markFailed(doc.id, doc.processingHistory, check.message);
      }

      const extractedPath = derivedExtractedPath(doc.id);
      await this.storage.putObject({
        path: extractedPath,
        buffer: Buffer.from(`${extracted}\n`, 'utf8'),
        contentType: 'text/plain; charset=utf-8',
        upsert: true,
      });

      const updated = await this.prisma.document.update({
        where: { id: doc.id },
        data: {
          processingStatus: DocumentProcessingStatus.EXTRACTED,
          extractedText: extracted,
          extractedPath,
          lastError: null,
          processingHistory: appendProcessingHistory(
            doc.processingHistory,
            DocumentProcessingStatus.EXTRACTED,
          ) as unknown as Prisma.InputJsonValue,
        },
      });

      this.logger.log(`extract ok document=${doc.id} chars=${extracted.length}`);
      return {
        documentId: updated.id,
        processingStatus: updated.processingStatus,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      return this.markFailed(
        doc.id,
        doc.processingHistory,
        `Extracción fallida: ${message}`.slice(0, 1000),
      );
    }
  }

  async normalizeDedup(documentId: string): Promise<PipelineStepResult> {
    const doc = await this.requireDocument(documentId);
    if (!doc.extractedText) {
      return this.markFailed(
        doc.id,
        doc.processingHistory,
        'No hay texto extraído para normalizar.',
      );
    }

    try {
      const metadata = asRecord(doc.metadata);
      const text = doc.extractedText;
      const contentHash = sha256Normalized(text);
      const ficha: NormalizedDocumentFicha = {
        sourceCode:
          doc.source?.code ??
          stringField(metadata, 'sourceCode') ??
          null,
        sourceId: doc.sourceId,
        url:
          stringField(metadata, 'finalUrl') ??
          stringField(metadata, 'url') ??
          stringField(metadata, 'externalRef') ??
          null,
        fetchedAt: stringField(metadata, 'fetchedAt'),
        mimeType: doc.mimeType,
        text,
        jobRunId: doc.jobRunId,
        contentHash,
      };

      const normalizedPath = derivedNormalizedPath(doc.id);
      await this.storage.putObject({
        path: normalizedPath,
        buffer: Buffer.from(`${JSON.stringify(ficha, null, 2)}\n`, 'utf8'),
        contentType: 'application/json',
        upsert: true,
      });

      let history = appendProcessingHistory(
        doc.processingHistory,
        DocumentProcessingStatus.NORMALIZED,
      );
      history = appendProcessingHistory(
        history as unknown as Prisma.JsonValue,
        DocumentProcessingStatus.HASHED,
      );

      const canonical = await this.prisma.document.findFirst({
        where: {
          contentHash,
          canonicalDocumentId: null,
          id: { not: doc.id },
          processingStatus: {
            in: [
              DocumentProcessingStatus.READY_FOR_AI,
              DocumentProcessingStatus.HASHED,
              DocumentProcessingStatus.NORMALIZED,
            ],
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      if (canonical) {
        history = appendProcessingHistory(
          history as unknown as Prisma.JsonValue,
          DocumentProcessingStatus.DEDUPED,
        );
        const updated = await this.prisma.document.update({
          where: { id: doc.id },
          data: {
            processingStatus: DocumentProcessingStatus.DEDUPED,
            contentHash,
            canonicalDocumentId: canonical.id,
            normalizedPath,
            lastError: null,
            processingHistory: history as unknown as Prisma.InputJsonValue,
          },
        });
        this.logger.log(
          `dedup document=${doc.id} canonical=${canonical.id}`,
        );
        return {
          documentId: updated.id,
          processingStatus: updated.processingStatus,
          contentHash,
          canonicalDocumentId: canonical.id,
        };
      }

      try {
        history = appendProcessingHistory(
          history as unknown as Prisma.JsonValue,
          DocumentProcessingStatus.READY_FOR_AI,
        );
        const updated = await this.prisma.document.update({
          where: { id: doc.id },
          data: {
            processingStatus: DocumentProcessingStatus.READY_FOR_AI,
            contentHash,
            canonicalDocumentId: null,
            normalizedPath,
            lastError: null,
            processingHistory: history as unknown as Prisma.InputJsonValue,
          },
        });
        this.logger.log(`ready_for_ai document=${doc.id}`);
        return {
          documentId: updated.id,
          processingStatus: updated.processingStatus,
          contentHash,
          canonicalDocumentId: null,
        };
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          const winner = await this.prisma.document.findFirst({
            where: {
              contentHash,
              canonicalDocumentId: null,
              id: { not: doc.id },
            },
            orderBy: { createdAt: 'asc' },
          });
          if (!winner) {
            throw err;
          }
          history = appendProcessingHistory(
            history as unknown as Prisma.JsonValue,
            DocumentProcessingStatus.DEDUPED,
          );
          const updated = await this.prisma.document.update({
            where: { id: doc.id },
            data: {
              processingStatus: DocumentProcessingStatus.DEDUPED,
              contentHash,
              canonicalDocumentId: winner.id,
              normalizedPath,
              lastError: null,
              processingHistory: history as unknown as Prisma.InputJsonValue,
            },
          });
          return {
            documentId: updated.id,
            processingStatus: updated.processingStatus,
            contentHash,
            canonicalDocumentId: winner.id,
          };
        }
        throw err;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.markFailed(
        doc.id,
        doc.processingHistory,
        `Normalización fallida: ${message}`.slice(0, 1000),
      );
    }
  }

  private async markFailed(
    documentId: string,
    history: Prisma.JsonValue | null,
    message: string,
  ): Promise<PipelineStepResult> {
    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        processingStatus: DocumentProcessingStatus.FAILED,
        lastError: message.slice(0, 1000),
        processingHistory: appendProcessingHistory(
          history,
          DocumentProcessingStatus.FAILED,
        ) as unknown as Prisma.InputJsonValue,
      },
    });
    this.logger.warn(`document failed id=${documentId}: ${message}`);
    return {
      documentId: updated.id,
      processingStatus: updated.processingStatus,
    };
  }

  private async requireDocument(documentId: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { source: { select: { code: true, name: true } } },
    });
    if (!doc) {
      throw new NotFoundException('Documento no encontrado.');
    }
    return doc;
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
