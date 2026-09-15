import { ImpactLevel, ReportStatus } from '../../database/prisma-client';
import {
  fromApiReportStatus,
  impactSortRank,
  reportDownloadName,
  reportFilePath,
  sortReportCandidates,
  toApiReportStatus,
} from './reports.constants';

describe('reports.constants', () => {
  it('maps Prisma status to the API contract (lowercase)', () => {
    expect(toApiReportStatus(ReportStatus.DRAFT)).toBe('draft');
    expect(toApiReportStatus(ReportStatus.SENT)).toBe('sent');
    expect(fromApiReportStatus('discarded')).toBe(ReportStatus.DISCARDED);
  });

  it('orders candidates Crítico → Alto → Medio, then newest first', () => {
    expect(impactSortRank(ImpactLevel.RED)).toBeLessThan(
      impactSortRank(ImpactLevel.ORANGE),
    );
    const older = new Date('2026-09-01T12:00:00.000Z');
    const newer = new Date('2026-09-02T12:00:00.000Z');
    const sorted = sortReportCandidates([
      { id: 'y', impact: ImpactLevel.YELLOW, createdAt: newer },
      { id: 'r-old', impact: ImpactLevel.RED, createdAt: older },
      { id: 'r-new', impact: ImpactLevel.RED, createdAt: newer },
      { id: 'o', impact: ImpactLevel.ORANGE, createdAt: newer },
    ]);
    expect(sorted.map((row) => row.id)).toEqual([
      'r-new',
      'r-old',
      'o',
      'y',
    ]);
  });

  it('builds storage path and download filename', () => {
    expect(reportFilePath('cli_1', 'rep_9')).toBe('reports/cli_1/rep_9.pdf');
    expect(
      reportDownloadName({
        slug: 'arca-continental',
        dateFrom: '2026-09-01',
        dateTo: '2026-09-14',
        generatedAt: new Date('2026-09-14T12:00:00.000Z'),
      }),
    ).toBe('NORMA-arca-continental-2026-09-14.pdf');
  });
});
