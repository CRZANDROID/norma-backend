import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ImpactLevel,
  Prisma,
  ReportStatus,
} from '../../database/prisma-client';
import { PrismaService } from '../../database/prisma.service';
import {
  isValidCalendarDate,
  trackingCalendarDate,
  zonedDayRange,
} from '../../jobs/schedule-window';
import type { AuthUser } from '../auth/auth.types';
import { assertClientAccess, isAdmin } from '../clients/client-access.util';
import { FindingsService } from '../findings/findings.service';
import { loteWhere } from '../findings/lote.where';
import {
  addImpactCount,
  emptyImpactCounts,
} from '../findings/progress.labels';
import { StorageService } from '../storage/storage.service';
import type { CreateReportDto } from './dto/create-report.dto';
import type { ListReportsQueryDto } from './dto/list-reports.query.dto';
import { renderReportPdf, type ReportPdfFinding } from './report-pdf';
import {
  fromApiReportStatus,
  reportDownloadName,
  reportFilePath,
  sortReportCandidates,
  toApiReportStatus,
} from './reports.constants';

const FINDING_INCLUDE = {
  client: { select: { id: true, name: true, slug: true } },
  source: { select: { id: true, name: true, code: true, url: true } },
  document: {
    select: {
      id: true,
      filename: true,
      processingStatus: true,
      metadata: true,
    },
  },
} satisfies Prisma.FindingInclude;

type FindingRow = Prisma.FindingGetPayload<{ include: typeof FINDING_INCLUDE }>;

const REPORT_INCLUDE = {
  client: {
    select: {
      id: true,
      name: true,
      slug: true,
      fiscalData: { select: { legalName: true } },
    },
  },
  generatedBy: { select: { id: true, name: true } },
  items: {
    orderBy: { sortOrder: 'asc' as const },
    include: { finding: { include: FINDING_INCLUDE } },
  },
} satisfies Prisma.ReportInclude;

type ReportRow = Prisma.ReportGetPayload<{ include: typeof REPORT_INCLUDE }>;

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly findings: FindingsService,
    private readonly storage: StorageService,
  ) {}

  async create(user: AuthUser, dto: CreateReportDto) {
    const clientId = dto.clientId.trim();
    assertClientAccess(user, clientId);
    const range = this.resolveDateRange(dto.dateFrom, dto.dateTo);
    await this.assertClientExists(clientId);
    await this.assertDayNotClassifying(user, range);

    const candidates = await this.listCandidates(clientId, range);
    if (candidates.length === 0) {
      throw new BadRequestException(
        'No hay hallazgos candidatos para el informe (amarillo, naranja o rojo no excluidos y no enviados).',
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const report = await tx.report.create({
        data: {
          clientId,
          dateFrom: range.from,
          dateTo: range.to,
          status: ReportStatus.DRAFT,
          generatedByUserId: user.id,
        },
      });
      await tx.reportFinding.createMany({
        data: candidates.map((row, index) => ({
          reportId: report.id,
          findingId: row.id,
          impact: row.impact,
          sortOrder: index,
        })),
      });
      return report.id;
    });

    await this.persistPdf(created, clientId, {
      clientName: candidates[0].client.name,
      legalName: await this.loadLegalName(clientId),
      dateFrom: range.from,
      dateTo: range.to,
      generatedAt: new Date(),
      generatedByName: user.name,
      findings: candidates.map((row) => this.toPdfFinding(row)),
    });

    return this.findOne(user, created);
  }

  async regenerate(user: AuthUser, id: string) {
    const row = await this.loadAccessibleRow(user, id);
    if (row.status === ReportStatus.SENT) {
      throw new ConflictException('No se puede regenerar un informe enviado.');
    }
    if (row.status === ReportStatus.DISCARDED) {
      throw new ConflictException('No se puede regenerar un informe descartado.');
    }

    const range = { from: row.dateFrom, to: row.dateTo };
    await this.assertDayNotClassifying(user, range);
    const candidates = await this.listCandidates(row.clientId, range);
    if (candidates.length === 0) {
      throw new BadRequestException(
        'No hay hallazgos candidatos para el informe (amarillo, naranja o rojo no excluidos y no enviados).',
      );
    }

    await this.replaceItems(row.id, candidates);
    await this.persistPdf(row.id, row.clientId, {
      clientName: row.client.name,
      legalName: row.client.fiscalData?.legalName ?? null,
      dateFrom: range.from,
      dateTo: range.to,
      generatedAt: new Date(),
      generatedByName: user.name,
      findings: candidates.map((finding) => this.toPdfFinding(finding)),
    });
    return this.findOne(user, row.id);
  }

  async getFile(user: AuthUser, id: string) {
    const row = await this.loadAccessibleRow(user, id);
    if (!row.filePath) {
      throw new NotFoundException('El informe aún no tiene archivo PDF.');
    }
    const file = await this.storage.getObject(row.filePath);
    return {
      data: file.data,
      contentType: 'application/pdf',
      filename: reportDownloadName({
        slug: row.client.slug,
        dateFrom: row.dateFrom,
        dateTo: row.dateTo,
        generatedAt: row.createdAt,
      }),
    };
  }

  async list(user: AuthUser, query: ListReportsQueryDto) {
    const where: Prisma.ReportWhereInput = {};
    if (!isAdmin(user)) {
      where.clientId = { in: user.memberships.map((m) => m.clientId) };
    }
    if (query.clientId?.trim()) {
      assertClientAccess(user, query.clientId.trim());
      where.clientId = query.clientId.trim();
    }
    if (query.status) {
      where.status = fromApiReportStatus(query.status);
    }

    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const [total, rows] = await Promise.all([
      this.prisma.report.count({ where }),
      this.prisma.report.findMany({
        where,
        include: REPORT_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    return {
      page,
      limit,
      total,
      totalPages,
      items: rows.map((row) => this.toListItem(row)),
    };
  }

  async findOne(user: AuthUser, id: string) {
    const row = await this.loadAccessibleRow(user, id);
    return this.toDetail(row);
  }

  private async listCandidates(
    clientId: string,
    range: { from: string | null; to: string | null },
  ): Promise<FindingRow[]> {
    const where: Prisma.FindingWhereInput = {
      clientId,
      ...loteWhere('incluidos'),
    };
    this.applyDateRange(where, range);
    const rows = await this.prisma.finding.findMany({
      where,
      include: FINDING_INCLUDE,
    });
    return sortReportCandidates(rows);
  }

  private async replaceItems(reportId: string, candidates: FindingRow[]) {
    await this.prisma.$transaction(async (tx) => {
      await tx.reportFinding.deleteMany({ where: { reportId } });
      await tx.reportFinding.createMany({
        data: candidates.map((row, index) => ({
          reportId,
          findingId: row.id,
          impact: row.impact,
          sortOrder: index,
        })),
      });
    });
  }

  private async assertDayNotClassifying(
    user: AuthUser,
    range: { from: string | null; to: string | null },
  ) {
    const date = trackingCalendarDate(new Date(), range.to ?? range.from ?? undefined);
    if (!isValidCalendarDate(date)) {
      throw new BadRequestException('dateTo/dateFrom debe ser un día civil YYYY-MM-DD.');
    }
    const board = await this.findings.progress(user, { date });
    const classifying = board.sources.some((row) => row.status === 'classifying');
    if (classifying) {
      throw new ConflictException(
        'No se puede generar el informe mientras haya fuentes en análisis.',
      );
    }
  }

  private async persistPdf(
    reportId: string,
    clientId: string,
    input: Parameters<typeof renderReportPdf>[0],
  ) {
    let buffer: Buffer;
    try {
      buffer = await renderReportPdf(input);
    } catch (error) {
      this.logger.error(
        `No se pudo renderizar el PDF report=${reportId}: ${String(error)}`,
      );
      throw new InternalServerErrorException(
        'No se pudo generar el PDF del informe.',
      );
    }

    const path = reportFilePath(clientId, reportId);
    try {
      const uploaded = await this.storage.putObject({
        path,
        buffer,
        contentType: 'application/pdf',
        upsert: true,
      });
      await this.prisma.report.update({
        where: { id: reportId },
        data: {
          fileBucket: uploaded.bucket,
          filePath: uploaded.path,
        },
      });
    } catch (error) {
      this.logger.error(
        `No se pudo guardar el PDF report=${reportId}: ${String(error)}`,
      );
      throw new InternalServerErrorException(
        'No se pudo guardar el PDF del informe. Intenta de nuevo.',
      );
    }
  }

  private async loadLegalName(clientId: string): Promise<string | null> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { fiscalData: { select: { legalName: true } } },
    });
    return client?.fiscalData?.legalName ?? null;
  }

  private async assertClientExists(clientId: string) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    });
    if (!client) {
      throw new NotFoundException('Cliente no encontrado.');
    }
  }

  private async loadAccessibleRow(user: AuthUser, id: string): Promise<ReportRow> {
    const row = await this.prisma.report.findUnique({
      where: { id },
      include: REPORT_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException('Informe no encontrado.');
    }
    if (!isAdmin(user) && !user.memberships.some((m) => m.clientId === row.clientId)) {
      throw new NotFoundException('Informe no encontrado.');
    }
    return row;
  }

  private resolveDateRange(
    dateFrom?: string,
    dateTo?: string,
  ): { from: string | null; to: string | null } {
    const from = dateFrom?.trim() || null;
    const to = dateTo?.trim() || null;
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

  private toListItem(row: ReportRow) {
    const counts = emptyImpactCounts();
    for (const item of row.items) {
      addImpactCount(counts, item.impact);
    }
    return {
      id: row.id,
      status: toApiReportStatus(row.status),
      client: {
        id: row.client.id,
        name: row.client.name,
        slug: row.client.slug,
        legalName: row.client.fiscalData?.legalName ?? null,
      },
      dateFrom: row.dateFrom,
      dateTo: row.dateTo,
      findingCount: row.items.length,
      counts: {
        red: counts.red,
        orange: counts.orange,
        yellow: counts.yellow,
      },
      fileUrl: row.filePath ? `/reports/${row.id}/file` : null,
      generatedAt: row.createdAt,
      generatedBy: row.generatedBy,
    };
  }

  private toDetail(row: ReportRow) {
    return {
      ...this.toListItem(row),
      findings: row.items.map((item) => this.toFindingItem(item.finding)),
    };
  }

  private toFindingItem(row: FindingRow) {
    return {
      id: row.id,
      title: row.title,
      impact: row.impact,
      suggestedAction: row.suggestedAction,
      justification: row.justification,
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
        url: documentUrlFromMetadata(row.document.metadata),
      },
      createdAt: row.createdAt,
    };
  }

  private toPdfFinding(row: FindingRow): ReportPdfFinding {
    const impact =
      row.impact === ImpactLevel.GREEN
        ? ImpactLevel.YELLOW
        : row.impact;
    return {
      title: row.title,
      impact,
      suggestedAction: row.suggestedAction,
      justification: row.justification,
      sourceName: row.source?.name ?? null,
      documentUrl: documentUrlFromMetadata(row.document.metadata),
      createdAt: row.createdAt,
    };
  }
}

function documentUrlFromMetadata(value: Prisma.JsonValue | null): string | null {
  const metadata = asRecord(value);
  return (
    stringField(metadata, 'finalUrl') ??
    stringField(metadata, 'url') ??
    stringField(metadata, 'externalRef')
  );
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
