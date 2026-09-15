import { ImpactLevel, ReportStatus } from '../../database/prisma-client';

export const REPORT_API_STATUSES = ['draft', 'sent', 'discarded'] as const;

export type ReportApiStatus = (typeof REPORT_API_STATUSES)[number];

export const REPORT_CANDIDATE_IMPACTS = [
  ImpactLevel.RED,
  ImpactLevel.ORANGE,
  ImpactLevel.YELLOW,
] as const;

const IMPACT_SORT_RANK: Record<
  (typeof REPORT_CANDIDATE_IMPACTS)[number],
  number
> = {
  [ImpactLevel.RED]: 0,
  [ImpactLevel.ORANGE]: 1,
  [ImpactLevel.YELLOW]: 2,
};

const API_STATUS_BY_PRISMA: Record<ReportStatus, ReportApiStatus> = {
  [ReportStatus.DRAFT]: 'draft',
  [ReportStatus.SENT]: 'sent',
  [ReportStatus.DISCARDED]: 'discarded',
};

const PRISMA_STATUS_BY_API: Record<ReportApiStatus, ReportStatus> = {
  draft: ReportStatus.DRAFT,
  sent: ReportStatus.SENT,
  discarded: ReportStatus.DISCARDED,
};

export function toApiReportStatus(status: ReportStatus): ReportApiStatus {
  return API_STATUS_BY_PRISMA[status];
}

export function fromApiReportStatus(status: ReportApiStatus): ReportStatus {
  return PRISMA_STATUS_BY_API[status];
}

export function impactSortRank(impact: ImpactLevel): number {
  if (impact === ImpactLevel.GREEN) {
    return 99;
  }
  return IMPACT_SORT_RANK[impact];
}

export function sortReportCandidates<
  T extends { impact: ImpactLevel; createdAt: Date; id: string },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const byImpact = impactSortRank(a.impact) - impactSortRank(b.impact);
    if (byImpact !== 0) {
      return byImpact;
    }
    const byDate = b.createdAt.getTime() - a.createdAt.getTime();
    if (byDate !== 0) {
      return byDate;
    }
    return b.id.localeCompare(a.id);
  });
}

export const IMPACT_REPORT_LABELS: Record<
  (typeof REPORT_CANDIDATE_IMPACTS)[number],
  string
> = {
  [ImpactLevel.RED]: 'Crítico',
  [ImpactLevel.ORANGE]: 'Alto',
  [ImpactLevel.YELLOW]: 'Medio',
};

export function reportFilePath(clientId: string, reportId: string): string {
  return `reports/${clientId}/${reportId}.pdf`;
}

export function reportDownloadName(params: {
  slug: string;
  dateFrom: string | null;
  dateTo: string | null;
  generatedAt: Date;
}): string {
  const day = params.dateTo ?? params.dateFrom ?? params.generatedAt.toISOString().slice(0, 10);
  const slug = params.slug.replace(/[^a-z0-9-]/gi, '-') || 'cliente';
  return `NORMA-${slug}-${day}.pdf`;
}
