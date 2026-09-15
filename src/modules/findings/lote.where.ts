import { Prisma, ReportStatus } from '../../database/prisma-client';
import { REPORT_CANDIDATE_IMPACTS } from '../reports/reports.constants';

export const FINDING_LOTES = ['incluidos', 'excluidos', 'enviados'] as const;

export type FindingLote = (typeof FINDING_LOTES)[number];

const NOT_IN_SENT_REPORT: Prisma.FindingWhereInput = {
  reportItems: {
    none: { report: { status: ReportStatus.SENT } },
  },
};

const IN_SENT_REPORT: Prisma.FindingWhereInput = {
  reportItems: {
    some: { report: { status: ReportStatus.SENT } },
  },
};

/** Incluidos = el lote que arma POST /reports (Y/O/R, no excluidos, no quemados). */
export function loteWhere(lote: FindingLote): Prisma.FindingWhereInput {
  if (lote === 'incluidos') {
    return {
      impact: { in: [...REPORT_CANDIDATE_IMPACTS] },
      excludedFromNextReport: false,
      ...NOT_IN_SENT_REPORT,
    };
  }
  if (lote === 'excluidos') {
    return {
      excludedFromNextReport: true,
      ...NOT_IN_SENT_REPORT,
    };
  }
  return IN_SENT_REPORT;
}
