import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { APIError } from 'openai';
import {
  DocumentProcessingStatus,
  EntityStatus,
  ImpactLevel,
  Prisma,
} from '../../database/prisma-client';
import { PrismaService } from '../../database/prisma.service';
import {
  CLASSIFY_TEXT_LIMIT,
} from '../../jobs/classify.constants';
import {
  normalizeJustification,
  parseRewriteResponse,
} from '../../jobs/classify-response';
import { isExtractableCrawlFile, isMetaCrawlFilename } from '../../jobs/document-text';
import {
  listTrackingSources,
  loadCrawlInFlightSourceIds,
} from '../../jobs/progress-board';
import type { ProgressDateQueryDto } from '../../jobs/dto/progress-date.query.dto';
import {
  isValidCalendarDate,
  trackingCalendarDate,
  zonedDayRange,
} from '../../jobs/schedule-window';
import type { AuthUser } from '../auth/auth.types';
import { assertClientAccess, isAdmin } from '../clients/client-access.util';
import { OpenAiClientService } from '../ai/openai-client.service';
import type { ListFindingsQueryDto } from './dto/list-findings.query.dto';
import type { RewriteFindingDto } from './dto/rewrite-finding.dto';
import type { UpdateFindingDto } from './dto/update-finding.dto';
import { loteWhere } from './lote.where';
import {
  REWRITE_NOTE_LIMIT,
  REWRITE_PROMPT_VERSION,
  REWRITE_SYSTEM_PROMPT,
  rewriteFailureMessage,
} from './rewrite.constants';
import {
  addImpactCount,
  analysisDaySignals,
  analysisProgressLabel,
  analysisProgressNote,
  emptyImpactCounts,
  mapAnalysisProgressStatus,
} from './progress.labels';

const JUSTIFICATION_SHORT = 240;

const FINDING_INCLUDE = {
  client: { select: { id: true, name: true, slug: true } },
  source: { select: { id: true, name: true, code: true, url: true } },
  document: {
    select: {
      id: true,
      filename: true,
      processingStatus: true,
      sourceId: true,
      metadata: true,
    },
  },
} satisfies Prisma.FindingInclude;

type FindingRow = Prisma.FindingGetPayload<{ include: typeof FINDING_INCLUDE }>;

@Injectable()
export class FindingsService {
  private readonly logger = new Logger(FindingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiClientService,
  ) {}

  async list(user: AuthUser, query: ListFindingsQueryDto) {
    const range = this.resolveDateRange(query);
    const filters = this.buildWhere(user, query, {
      includeImpact: false,
      includeExcluded: false,
    });
    this.applyDateRange(filters, range);

    const listWhere: Prisma.FindingWhereInput = { AND: [filters] };
    if (query.impact) {
      this.pushAnd(listWhere, { impact: query.impact });
    }
    if (query.lote) {
      if (query.excluded !== undefined) {
        throw new BadRequestException(
          'Usa lote o excluded, no los dos. lote gana el contrato nuevo.',
        );
      }
      this.pushAnd(listWhere, loteWhere(query.lote));
    } else if (query.excluded !== undefined) {
      this.pushAnd(listWhere, { excludedFromNextReport: query.excluded });
    }

    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const includedWhere: Prisma.FindingWhereInput = {
      AND: [filters, loteWhere('incluidos')],
    };
    const excludedWhere: Prisma.FindingWhereInput = {
      AND: [filters, loteWhere('excluidos')],
    };
    const sentWhere: Prisma.FindingWhereInput = {
      AND: [filters, loteWhere('enviados')],
    };
    const [total, rows, impactGroups, included, excluded, sent] =
      await Promise.all([
        this.prisma.finding.count({ where: listWhere }),
        this.prisma.finding.findMany({
          where: listWhere,
          include: FINDING_INCLUDE,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.finding.groupBy({
          by: ['impact'],
          where: filters,
          _count: { _all: true },
        }),
        this.prisma.finding.count({ where: includedWhere }),
        this.prisma.finding.count({ where: excludedWhere }),
        this.prisma.finding.count({ where: sentWhere }),
      ]);
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    const counts = {
      ...this.toImpactCounts(impactGroups),
      included,
      excluded,
      sent,
    };

    return {
      dateFrom: range.from,
      dateTo: range.to,
      page,
      limit,
      total,
      totalPages,
      counts,
      items: rows.map((row) => this.toListItem(row)),
    };
  }

  async progress(user: AuthUser, query: ProgressDateQueryDto) {
    const date = trackingCalendarDate(new Date(), query.date);
    if (!isValidCalendarDate(date)) {
      throw new BadRequestException('date debe ser un día civil YYYY-MM-DD.');
    }

    const { start, end } = zonedDayRange(date);
    const sources = await listTrackingSources(this.prisma);
    const sourceIds = sources.map((s) => s.id);
    const analystClientIds = isAdmin(user)
      ? null
      : user.memberships.map((m) => m.clientId);

    const docs =
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
            },
          });

    const findings =
      sourceIds.length === 0 ||
      (analystClientIds !== null && analystClientIds.length === 0)
        ? []
        : await this.prisma.finding.findMany({
            where: {
              sourceId: { in: sourceIds },
              ...(analystClientIds
                ? { clientId: { in: analystClientIds } }
                : {}),
              OR: [
                { createdAt: { gte: start, lt: end } },
                {
                  document: {
                    jobRun: {
                      idempotencyKey: { contains: `:${date}:` },
                    },
                  },
                },
              ],
            },
            select: {
              impact: true,
              sourceId: true,
            },
          });

    const crawlInFlightIds = await loadCrawlInFlightSourceIds(
      this.prisma,
      date,
      sourceIds,
    );

    const docsBySource = new Map<string, (typeof docs)[number][]>();
    for (const doc of docs) {
      if (
        !doc.sourceId ||
        isMetaCrawlFilename(doc.filename) ||
        !isExtractableCrawlFile(doc.filename, doc.mimeType)
      ) {
        continue;
      }
      const list = docsBySource.get(doc.sourceId) ?? [];
      list.push(doc);
      docsBySource.set(doc.sourceId, list);
    }

    const findingsBySource = new Map<string, (typeof findings)[number][]>();
    for (const finding of findings) {
      if (!finding.sourceId) {
        continue;
      }
      const list = findingsBySource.get(finding.sourceId) ?? [];
      list.push(finding);
      findingsBySource.set(finding.sourceId, list);
    }

    return {
      date,
      sources: sources.map((source) => {
        const dayDocs = docsBySource.get(source.id) ?? [];
        const dayFindings = findingsBySource.get(source.id) ?? [];
        const signals = analysisDaySignals(
          dayDocs,
          dayFindings.length,
          crawlInFlightIds.has(source.id),
        );
        const status = mapAnalysisProgressStatus(signals);
        const counts = emptyImpactCounts();
        for (const finding of dayFindings) {
          addImpactCount(counts, finding.impact);
        }

        return {
          sourceId: source.id,
          sourceName: source.name,
          status,
          label: analysisProgressLabel(status),
          counts,
          note: analysisProgressNote(status, signals),
        };
      }),
    };
  }

  async findOne(user: AuthUser, id: string) {
    const row = await this.loadAccessibleRow(user, id);
    return this.toDetail(row);
  }

  async update(user: AuthUser, id: string, dto: UpdateFindingDto) {
    await this.loadAccessibleRow(user, id);
    const data: Prisma.FindingUpdateInput = {};
    if (dto.title !== undefined) {
      const title = dto.title.replace(/\s+/g, ' ').trim().slice(0, 160);
      if (!title) {
        throw new BadRequestException('title no puede quedar vacío.');
      }
      data.title = title;
    }
    if (dto.justification !== undefined) {
      const justification = normalizeJustification(dto.justification);
      if (!justification) {
        throw new BadRequestException('justification no puede quedar vacío.');
      }
      data.justification = justification;
      data.description = justification.slice(0, 2000);
    }
    if (dto.impact !== undefined) {
      data.impact = dto.impact;
      // GREEN nunca entra al informe: el flag de exclusión pierde sentido.
      if (dto.impact === ImpactLevel.GREEN) {
        data.excludedFromNextReport = false;
      }
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Envía title, justification y/o impact.');
    }
    const updated = await this.prisma.finding.update({
      where: { id },
      data,
      include: FINDING_INCLUDE,
    });
    return this.toDetail(updated);
  }

  async exclude(user: AuthUser, id: string) {
    const row = await this.loadAccessibleRow(user, id);
    if (row.impact === ImpactLevel.GREEN) {
      throw new BadRequestException(
        'Los hallazgos informativos (GREEN) no entran al informe.',
      );
    }
    const updated = await this.prisma.finding.update({
      where: { id },
      data: { excludedFromNextReport: true },
      include: FINDING_INCLUDE,
    });
    return this.toDetail(updated);
  }

  async include(user: AuthUser, id: string) {
    await this.loadAccessibleRow(user, id);
    const updated = await this.prisma.finding.update({
      where: { id },
      data: { excludedFromNextReport: false },
      include: FINDING_INCLUDE,
    });
    return this.toDetail(updated);
  }

  async rewrite(user: AuthUser, id: string, dto: RewriteFindingDto) {
    const row = await this.loadAccessibleRow(user, id);
    if (!this.openai.isConfigured()) {
      throw new ServiceUnavailableException(
        'OpenAI no configurado. Define OPENAI_API_KEY.',
      );
    }
    const document = await this.prisma.document.findUnique({
      where: { id: row.documentId },
      select: {
        extractedText: true,
        source: {
          select: {
            name: true,
            code: true,
            searchFocus: true,
            keywordsGuide: true,
          },
        },
      },
    });
    const excerpt = (document?.extractedText ?? '').trim();
    if (!excerpt) {
      throw new BadRequestException(
        'El documento no tiene texto extraído para reescribir.',
      );
    }
    const client = await this.prisma.client.findUnique({
      where: { id: row.clientId },
      include: {
        profiles: {
          where: { status: EntityStatus.ACTIVE },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });
    const profile = client?.profiles[0];
    const userPrompt = [
      `Cliente: ${client?.name ?? row.client.name}`,
      profile
        ? `Perfil: ${profile.name}`
        : 'Perfil: no hay perfil regulatorio activo.',
      profile?.description ? `Descripción: ${profile.description}` : '',
      `Palabras clave: ${(profile?.keywords ?? []).join(', ') || '(ninguna)'}`,
      `Fuente: ${document?.source?.name ?? document?.source?.code ?? 'fuente'}`,
      `Título actual (conservar salvo que pidan cambiarlo): ${row.title}`,
      '',
      'Borrador vigente (justification; puede haberlo editado el consultor a mano). Edítalo; no lo sustituyas salvo que la indicación lo pida:',
      row.justification,
      '',
      `Indicación del consultor (delta sobre la plantilla NORMA; no hace falta repetir fecha ni acto): ${dto.prompt.trim()}`,
      '',
      'Texto del documento (solo fuente de hechos; no es un briefing nuevo):',
      excerpt.slice(0, CLASSIFY_TEXT_LIMIT),
    ]
      .filter((line) => line !== '')
      .join('\n');

    const openai = this.openai.ensureClient();
    const model = this.openai.getModel();
    let completion;
    try {
      completion = await openai.chat.completions.create({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: REWRITE_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      });
    } catch (error) {
      this.rethrowOpenAi(error);
    }

    const raw = completion.choices[0]?.message?.content?.trim() ?? '';
    let parsed;
    try {
      parsed = parseRewriteResponse(raw, REWRITE_NOTE_LIMIT);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException(message);
    }

    const usage = completion.usage
      ? {
          promptTokens: completion.usage.prompt_tokens ?? 0,
          completionTokens: completion.usage.completion_tokens ?? 0,
          totalTokens: completion.usage.total_tokens ?? 0,
        }
      : null;

    // `none` gana sobre el texto: el modelo pudo devolver un cambio cosmético
    // sabiendo que la indicación no se sostiene. Ese borrador no se guarda.
    const unchanged =
      parsed.title === row.title &&
      parsed.justification === row.justification;
    if (parsed.applied === 'none' || unchanged) {
      this.logger.warn(
        `rewrite sin aplicar finding=${id} applied=${parsed.applied} unchanged=${unchanged} tokens=${usage?.totalTokens ?? 0} note=${parsed.note ?? '(sin nota)'}`,
      );
      throw new UnprocessableEntityException(
        rewriteFailureMessage(parsed.note),
      );
    }

    const existingMeta = asRecord(row.aiMeta);
    const aiMeta: Prisma.InputJsonValue = {
      ...existingMeta,
      lastRewrite: {
        at: new Date().toISOString(),
        model: completion.model ?? model,
        promptVersion: REWRITE_PROMPT_VERSION,
        prompt: dto.prompt.trim(),
        applied: parsed.applied,
        note: parsed.note,
        usage,
      },
    };

    const updated = await this.prisma.finding.update({
      where: { id },
      data: {
        title: parsed.title,
        justification: parsed.justification,
        description: parsed.justification.slice(0, 2000),
        aiMeta,
      },
      include: FINDING_INCLUDE,
    });
    return { ...this.toDetail(updated), rewriteNote: parsed.note };
  }

  private async loadAccessibleRow(user: AuthUser, id: string): Promise<FindingRow> {
    const row = await this.prisma.finding.findUnique({
      where: { id },
      include: FINDING_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException('Hallazgo no encontrado.');
    }
    if (!isAdmin(user) && !user.memberships.some((m) => m.clientId === row.clientId)) {
      throw new NotFoundException('Hallazgo no encontrado.');
    }
    return row;
  }

  private buildWhere(
    user: AuthUser,
    query: ListFindingsQueryDto,
    options: { includeImpact: boolean; includeExcluded?: boolean } = {
      includeImpact: true,
    },
  ): Prisma.FindingWhereInput {
    const where: Prisma.FindingWhereInput = {};

    if (!isAdmin(user)) {
      const clientIds = user.memberships.map((m) => m.clientId);
      where.clientId = { in: clientIds };
    }

    if (query.clientId?.trim()) {
      assertClientAccess(user, query.clientId.trim());
      where.clientId = query.clientId.trim();
    }

    if (query.sourceId?.trim()) {
      where.sourceId = query.sourceId.trim();
    } else if (query.sourceCode?.trim()) {
      where.source = { code: query.sourceCode.trim() };
    }

    if (query.documentId?.trim()) {
      where.documentId = query.documentId.trim();
    }

    if (options.includeImpact && query.impact) {
      where.impact = query.impact;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (options.includeExcluded && query.excluded !== undefined) {
      where.excludedFromNextReport = query.excluded;
    }

    return where;
  }

  private resolveDateRange(query: ListFindingsQueryDto): {
    from: string | null;
    to: string | null;
  } {
    const from = query.dateFrom?.trim() || null;
    const to = query.dateTo?.trim() || null;
    if (from && !isValidCalendarDate(from)) {
      throw new BadRequestException('dateFrom debe ser un día civil YYYY-MM-DD.');
    }
    if (to && !isValidCalendarDate(to)) {
      throw new BadRequestException('dateTo debe ser un día civil YYYY-MM-DD.');
    }
    if (from && to && from > to) {
      throw new BadRequestException('dateFrom no puede ser posterior a dateTo.');
    }
    return { from, to };
  }

  private applyDateRange(
    where: Prisma.FindingWhereInput,
    range: { from: string | null; to: string | null },
  ) {
    if (!range.from && !range.to) {
      return;
    }
    const createdAt: Prisma.DateTimeFilter = {};
    const jobCreatedAt: Prisma.DateTimeFilter = {};
    if (range.from) {
      const start = zonedDayRange(range.from).start;
      createdAt.gte = start;
      jobCreatedAt.gte = start;
    }
    if (range.to) {
      const end = zonedDayRange(range.to).end;
      createdAt.lt = end;
      jobCreatedAt.lt = end;
    }
    this.pushAnd(where, {
      OR: [
        { createdAt },
        { document: { jobRun: { createdAt: jobCreatedAt } } },
      ],
    });
  }

  private toImpactCounts(
    groups: Array<{ impact: string; _count: { _all: number } }>,
  ): { total: number; red: number; orange: number; yellow: number; green: number } {
    const counts = { total: 0, ...emptyImpactCounts() };
    for (const group of groups) {
      const n = group._count._all;
      counts.total += n;
      addImpactCount(
        counts,
        group.impact as Parameters<typeof addImpactCount>[1],
        n,
      );
    }
    return counts;
  }

  private pushAnd(
    where: Prisma.FindingWhereInput,
    clause: Prisma.FindingWhereInput,
  ) {
    const existing = where.AND;
    const list = Array.isArray(existing)
      ? existing
      : existing
        ? [existing]
        : [];
    where.AND = [...list, clause];
  }

  private toListItem(row: FindingRow) {
    const metadata = asRecord(row.document.metadata);
    const pageUrl =
      stringField(metadata, 'finalUrl') ??
      stringField(metadata, 'url') ??
      stringField(metadata, 'externalRef');
    return {
      id: row.id,
      title: row.title,
      impact: row.impact,
      status: row.status,
      suggestedAction: row.suggestedAction,
      excludedFromNextReport: row.excludedFromNextReport,
      justificationShort: row.justification.slice(0, JUSTIFICATION_SHORT),
      client: row.client,
      source: row.source
        ? {
            id: row.source.id,
            name: row.source.name,
            code: row.source.code,
            url: row.source.url,
          }
        : null,
      document: {
        id: row.document.id,
        filename: row.document.filename,
        processingStatus: row.document.processingStatus,
        url: pageUrl,
      },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toDetail(row: FindingRow) {
    return {
      ...this.toListItem(row),
      justification: row.justification,
      description: row.description,
      aiMeta: row.aiMeta,
    };
  }

  private rethrowOpenAi(error: unknown): never {
    if (error instanceof APIError) {
      const retryable = error.status === 429 || (error.status ?? 0) >= 500;
      throw new ServiceUnavailableException(
        retryable
          ? 'OpenAI no disponible por ahora. Intenta de nuevo.'
          : 'OpenAI rechazó la solicitud. Revisa el modelo o la API key.',
      );
    }
    throw new ServiceUnavailableException(
      'No se pudo contactar a OpenAI. Intenta de nuevo.',
    );
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
