import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../database/prisma-client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { assertClientAccess, isAdmin } from '../clients/client-access.util';
import type { ListFindingsQueryDto } from './dto/list-findings.query.dto';

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
