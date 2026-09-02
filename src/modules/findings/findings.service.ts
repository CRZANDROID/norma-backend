import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentProcessingStatus, Prisma } from '../../database/prisma-client';
import { PrismaService } from '../../database/prisma.service';
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
import type { ListFindingsQueryDto } from './dto/list-findings.query.dto';
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
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, query: ListFindingsQueryDto) {
    const where = this.buildWhere(user, query);
    const limit = query.limit ?? 50;
    const rows = await this.prisma.finding.findMany({
      where,
      include: FINDING_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => this.toListItem(row));
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
    return this.toDetail(row);
  }

  private buildWhere(
    user: AuthUser,
    query: ListFindingsQueryDto,
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

    if (query.impact) {
      where.impact = query.impact;
    }

    if (query.status) {
      where.status = query.status;
    }

    return where;
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
