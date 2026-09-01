import { Injectable, Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { APIError } from 'openai';
import {
  DocumentProcessingStatus,
  EntityStatus,
  FindingStatus,
  Prisma,
} from '../database/prisma-client';
import { PrismaService } from '../database/prisma.service';
import { OpenAiClientService } from '../modules/ai/openai-client.service';
import { snapshotSuggestedAction } from '../modules/clients/delivery.util';
import { appendProcessingHistory } from './processing-history';
import { parseClassifyResponse } from './classify-response';
import {
  CLASSIFY_PROMPT_VERSION,
  CLASSIFY_SYSTEM_PROMPT,
  CLASSIFY_TEXT_LIMIT,
} from './classify.constants';

export type ClassifyJobResult = {
  documentId: string;
  processingStatus: DocumentProcessingStatus;
  findingsUpserted: number;
  skipped: boolean;
  skipReason?: string;
};

@Injectable()
export class DocumentClassifyService {
  private readonly logger = new Logger(DocumentClassifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiClientService,
  ) {}

  async classify(documentId: string): Promise<ClassifyJobResult> {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        source: {
          select: {
            id: true,
            name: true,
            code: true,
            searchFocus: true,
            keywordsGuide: true,
          },
        },
      },
    });

    if (!doc) {
      throw new UnrecoverableError(
        `Documento ${documentId} no encontrado para clasificar.`,
      );
    }

    if (
      doc.processingStatus === DocumentProcessingStatus.DEDUPED ||
      doc.canonicalDocumentId
    ) {
      this.logger.log(
        `skip classify document=${documentId} (duplicado; se clasifica el canónico)`,
      );
      return {
        documentId,
        processingStatus: doc.processingStatus,
        findingsUpserted: 0,
        skipped: true,
        skipReason: 'deduped',
      };
    }

    if (
      doc.processingStatus !== DocumentProcessingStatus.READY_FOR_AI &&
      doc.processingStatus !== DocumentProcessingStatus.CLASSIFIED
    ) {
      this.logger.log(
        `skip classify document=${documentId} status=${doc.processingStatus}`,
      );
      return {
        documentId,
        processingStatus: doc.processingStatus,
        findingsUpserted: 0,
        skipped: true,
        skipReason: `status ${doc.processingStatus}`,
      };
    }

    const extractedText = (doc.extractedText ?? '').trim();
    if (!extractedText) {
      throw new UnrecoverableError(
        'El documento no tiene texto extraído para clasificar.',
      );
    }

    if (!doc.sourceId) {
      this.logger.log(
        `skip classify document=${documentId} (sin fuente vinculada)`,
      );
      return this.markClassified(doc.id, doc.processingHistory, 0, 'no source');
    }

    const links = await this.prisma.clientSource.findMany({
      where: {
        sourceId: doc.sourceId,
        client: { status: EntityStatus.ACTIVE },
      },
      include: {
        client: {
          include: {
            profiles: {
              where: { status: EntityStatus.ACTIVE },
              orderBy: { createdAt: 'asc' },
            },
            deliveryConfig: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (links.length === 0) {
      this.logger.log(
        `skip classify document=${documentId} source=${doc.source?.code} (sin clientes en client_sources)`,
      );
      return this.markClassified(
        doc.id,
        doc.processingHistory,
        0,
        'no clients',
      );
    }

    if (!this.openai.isConfigured()) {
      await this.setLastError(
        doc.id,
        'Clasificación: OpenAI no configurado. Define OPENAI_API_KEY.',
      );
      throw new UnrecoverableError(
        'OpenAI no configurado. Define OPENAI_API_KEY.',
      );
    }

    const excerpt = extractedText.slice(0, CLASSIFY_TEXT_LIMIT);
    const sourceId = doc.sourceId;
    let findingsUpserted = 0;

    try {
      for (const link of links) {
        await this.classifyForClient({
          documentId: doc.id,
          sourceId,
          sourceName: doc.source?.name ?? doc.source?.code ?? 'fuente',
          sourceFocus: [
            ...(doc.source?.searchFocus ?? []),
            ...(doc.source?.keywordsGuide ?? []),
          ],
          excerpt,
          client: link.client,
        });
        findingsUpserted += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.setLastError(doc.id, `Clasificación: ${message.slice(0, 900)}`);
      throw error;
    }

    return this.markClassified(doc.id, doc.processingHistory, findingsUpserted);
  }

  private async classifyForClient(params: {
    documentId: string;
    sourceId: string;
    sourceName: string;
    sourceFocus: string[];
    excerpt: string;
    client: {
      id: string;
      name: string;
      profiles: Array<{
        name: string;
        keywords: string[];
        categories: string[];
        description: string | null;
      }>;
      deliveryConfig: { impactActions: Prisma.JsonValue } | null;
    };
  }) {
    const profile = params.client.profiles[0];
    const userPrompt = [
      `Cliente: ${params.client.name}`,
      profile
        ? `Perfil: ${profile.name}`
        : 'Perfil: no hay perfil regulatorio activo.',
      profile?.description ? `Descripción: ${profile.description}` : '',
      `Palabras clave: ${(profile?.keywords ?? []).join(', ') || '(ninguna)'}`,
      `Categorías: ${(profile?.categories ?? []).join(', ') || '(ninguna)'}`,
      `Fuente: ${params.sourceName}`,
      `Enfoque de la fuente: ${params.sourceFocus.join(', ') || '(no indicado)'}`,
      '',
      'Texto del documento:',
      params.excerpt,
    ]
      .filter((line) => line !== '')
      .join('\n');

    const client = this.openai.ensureClient();
    const model = this.openai.getModel();
    let completion;
    try {
      completion = await client.chat.completions.create({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: CLASSIFY_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      });
    } catch (error) {
      this.rethrowOpenAi(error);
    }

    const raw = completion.choices[0]?.message?.content?.trim() ?? '';
    let parsed;
    try {
      parsed = parseClassifyResponse(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new UnrecoverableError(message);
    }

    const suggestedAction = snapshotSuggestedAction(
      parsed.impact,
      params.client.deliveryConfig?.impactActions,
    );
    const aiMeta: Prisma.InputJsonValue = {
      model: completion.model ?? model,
      promptVersion: CLASSIFY_PROMPT_VERSION,
      relevant: parsed.relevant,
      usage: completion.usage
        ? {
            promptTokens: completion.usage.prompt_tokens ?? 0,
            completionTokens: completion.usage.completion_tokens ?? 0,
            totalTokens: completion.usage.total_tokens ?? 0,
          }
        : null,
    };

    await this.prisma.finding.upsert({
      where: {
        documentId_clientId: {
          documentId: params.documentId,
          clientId: params.client.id,
        },
      },
      create: {
        title: parsed.title,
        description: parsed.justification.slice(0, 2000),
        justification: parsed.justification,
        impact: parsed.impact,
        status: FindingStatus.OPEN,
        suggestedAction,
        clientId: params.client.id,
        sourceId: params.sourceId,
        documentId: params.documentId,
        aiMeta,
      },
      update: {
        title: parsed.title,
        description: parsed.justification.slice(0, 2000),
        justification: parsed.justification,
        impact: parsed.impact,
        suggestedAction,
        sourceId: params.sourceId,
        aiMeta,
      },
    });
  }

  private async markClassified(
    documentId: string,
    history: Prisma.JsonValue,
    findingsUpserted: number,
    skipReason?: string,
  ): Promise<ClassifyJobResult> {
    const nextHistory = appendProcessingHistory(
      history,
      DocumentProcessingStatus.CLASSIFIED,
    );
    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        processingStatus: DocumentProcessingStatus.CLASSIFIED,
        lastError: null,
        processingHistory: nextHistory as unknown as Prisma.InputJsonValue,
      },
    });
    this.logger.log(
      `classified document=${documentId} findings=${findingsUpserted}${
        skipReason ? ` skip=${skipReason}` : ''
      }`,
    );
    return {
      documentId,
      processingStatus: updated.processingStatus,
      findingsUpserted,
      skipped: Boolean(skipReason),
      skipReason,
    };
  }

  private async setLastError(documentId: string, message: string) {
    await this.prisma.document.update({
      where: { id: documentId },
      data: { lastError: message.slice(0, 1000) },
    });
  }

  private rethrowOpenAi(error: unknown): never {
    if (error instanceof APIError) {
      const retryable = error.status === 429 || (error.status ?? 0) >= 500;
      const message = retryable
        ? 'OpenAI no disponible por ahora. Intenta de nuevo.'
        : 'OpenAI rechazó la solicitud. Revisa el modelo o la API key.';
      if (!retryable) {
        throw new UnrecoverableError(message);
      }
      throw new Error(message);
    }
    throw new Error('No se pudo contactar a OpenAI. Intenta de nuevo.');
  }
}
