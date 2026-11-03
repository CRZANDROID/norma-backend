import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  EntityStatus,
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
import {
  reportFooterNote,
  type EmailDelivery,
} from '../mail/email-delivery';
import { TransactionalMailService } from '../mail/transactional-mail.service';
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
    private readonly mail: TransactionalMailService,
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

    if (await this.isAutoSend(clientId)) {
      return this.send(user, created, dto.contactIds ?? []);
    }
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

  async send(user: AuthUser, id: string, contactIds: string[]) {
    const row = await this.loadAccessibleRow(user, id);
    if (row.status === ReportStatus.SENT) {
      throw new ConflictException('El informe ya fue enviado.');
    }
    if (row.status === ReportStatus.DISCARDED) {
      throw new ConflictException('No se puede enviar un informe descartado.');
    }

    const chosen = uniqueIds(contactIds);
    if (chosen.length === 0) {
      return this.keepDraft(user, row.id, {
        sent: false,
        reason: 'no_recipients',
        message:
          'Elige al menos un contacto. No se envió el correo. El informe sigue en borrador.',
        recipients: [],
      });
    }
    const recipients = await this.recipientEmails(row.clientId, chosen);
    const filename = reportDownloadName({
      slug: row.client.slug,
      dateFrom: row.dateFrom,
      dateTo: row.dateTo,
      generatedAt: row.createdAt,
    });
    const blocked = this.mail.blocked(recipients);
    let email = blocked;
    let sentPdf: Buffer | null = null;
    if (!blocked) {
      sentPdf = await this.renderBuffer(
        {
          ...this.toPdfInput(row),
          footerNote: reportFooterNote({
            sent: true,
            reason: 'sent',
            message: '',
            recipients,
          }),
        },
        row.id,
      );
      email = await this.mail.sendReport({
        recipients,
        subject: `Informe NORMA — ${row.client.name}`,
        html: reportEmailHtml(
          row.client.name,
          row.dateFrom,
          row.dateTo,
          row.items.length,
        ),
        text: reportEmailText(
          row.client.name,
          row.dateFrom,
          row.dateTo,
          row.items.length,
        ),
        filename,
        pdf: sentPdf,
      });
    }
    if (!email) {
      throw new InternalServerErrorException(
        'No se registró el resultado del correo.',
      );
    }
    if (!email.sent) {
      return this.keepDraft(user, row.id, email);
    }
    if (sentPdf) {
      try {
        await this.storePdf(row.id, row.clientId, sentPdf);
      } catch (error) {
        this.logger.error(
          `El correo salió pero no se pudo guardar el PDF report=${row.id}: ${String(error)}`,
        );
      }
    }
    await this.prisma.report.update({
      where: { id: row.id },
      data: {
        status: ReportStatus.SENT,
        sentAt: new Date(),
        emailDelivery: email as unknown as Prisma.InputJsonValue,
      },
    });
    return this.findOne(user, row.id);
  }

  async discard(user: AuthUser, id: string) {
    const row = await this.loadAccessibleRow(user, id);
    if (row.status === ReportStatus.SENT) {
      throw new ConflictException('No se puede descartar un informe enviado.');
    }
    if (row.status === ReportStatus.DISCARDED) {
      throw new ConflictException('El informe ya está descartado.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.report.update({
        where: { id: row.id },
        data: {
          status: ReportStatus.DISCARDED,
          discardedAt: new Date(),
        },
      });
      await tx.finding.updateMany({
        where: {
          clientId: row.clientId,
          excludedFromNextReport: true,
          reportItems: { none: { report: { status: ReportStatus.SENT } } },
        },
        data: { excludedFromNextReport: false },
      });
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
    const buffer = await this.renderBuffer(input, reportId);
    await this.storePdf(reportId, clientId, buffer);
  }

  private async renderBuffer(
    input: Parameters<typeof renderReportPdf>[0],
    reportId = 'pending',
  ): Promise<Buffer> {
    try {
      return await renderReportPdf(input);
    } catch (error) {
      this.logger.error(
        `No se pudo renderizar el PDF report=${reportId}: ${String(error)}`,
      );
      throw new InternalServerErrorException(
        'No se pudo generar el PDF del informe.',
      );
    }
  }

  private async storePdf(reportId: string, clientId: string, buffer: Buffer) {
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

  private toPdfInput(row: ReportRow): Parameters<typeof renderReportPdf>[0] {
    return {
      clientName: row.client.name,
      legalName: row.client.fiscalData?.legalName ?? null,
      dateFrom: row.dateFrom,
      dateTo: row.dateTo,
      generatedAt: row.createdAt,
      generatedByName: row.generatedBy.name,
      findings: row.items.map((item) => this.toPdfFinding(item.finding)),
    };
  }

  private async isAutoSend(clientId: string): Promise<boolean> {
    const config = await this.prisma.clientDeliveryConfig.findUnique({
      where: { clientId },
      select: { autoSend: true },
    });
    return config?.autoSend === true;
  }

  private async keepDraft(
    user: AuthUser,
    reportId: string,
    email: EmailDelivery,
  ) {
    await this.prisma.report.update({
      where: { id: reportId },
      data: {
        emailDelivery: email as unknown as Prisma.InputJsonValue,
      },
    });
    return this.findOne(user, reportId);
  }

  private async recipientEmails(
    clientId: string,
    contactIds: string[],
  ): Promise<string[]> {
    const contacts = await this.prisma.clientContact.findMany({
      where: {
        clientId,
        id: { in: contactIds },
        status: EntityStatus.ACTIVE,
      },
      select: { id: true, email: true },
    });
    if (contacts.length !== contactIds.length) {
      throw new BadRequestException(
        'Elige contactos activos de este cliente.',
      );
    }
    const emails = contacts
      .map((row) => row.email?.trim() ?? '')
      .filter((email) => email.length > 0);
    if (emails.length !== contacts.length) {
      throw new BadRequestException(
        'Elige contactos activos que tengan correo.',
      );
    }
    return emails;
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
      email: parseEmailDelivery(row.emailDelivery),
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
      changeNote: row.changeNote,
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
      changeNote: row.changeNote,
      createdAt: row.createdAt,
    };
  }
}

function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function reportEmailHtml(
  clientName: string,
  dateFrom: string | null,
  dateTo: string | null,
  findingCount: number,
): string {
  const period = periodLabel(dateFrom, dateTo);
  const noun = findingCount === 1 ? 'hallazgo' : 'hallazgos';
  return [
    `<p>NORMA preparó el informe de <strong>${escapeHtml(clientName)}</strong>.</p>`,
    `<p>Periodo: ${escapeHtml(period)}. Incluye ${findingCount} ${noun}.</p>`,
    '<p>El PDF va adjunto.</p>',
  ].join('');
}

function reportEmailText(
  clientName: string,
  dateFrom: string | null,
  dateTo: string | null,
  findingCount: number,
): string {
  const period = periodLabel(dateFrom, dateTo);
  const noun = findingCount === 1 ? 'hallazgo' : 'hallazgos';
  return `NORMA preparó el informe de ${clientName}. Periodo: ${period}. Incluye ${findingCount} ${noun}. El PDF va adjunto.`;
}

function periodLabel(from: string | null, to: string | null): string {
  if (from && to) {
    return from === to ? from : `${from} a ${to}`;
  }
  if (from) {
    return `desde ${from}`;
  }
  if (to) {
    return `hasta ${to}`;
  }
  return 'hallazgos candidatos a la fecha de generación';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseEmailDelivery(value: Prisma.JsonValue | null): EmailDelivery | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (typeof row.sent !== 'boolean' || typeof row.message !== 'string') {
    return null;
  }
  const reason = row.reason;
  const allowed = [
    'sent',
    'missing_api_key',
    'missing_from',
    'no_recipients',
    'provider_error',
  ] as const;
  if (typeof reason !== 'string' || !allowed.includes(reason as (typeof allowed)[number])) {
    return null;
  }
  const recipients = Array.isArray(row.recipients)
    ? row.recipients.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    sent: row.sent,
    reason: reason as EmailDelivery['reason'],
    message: row.message,
    recipients,
  };
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
