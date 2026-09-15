import { ReportStatus } from '../../database/prisma-client';
import { REPORT_CANDIDATE_IMPACTS } from '../reports/reports.constants';
import { loteWhere } from './lote.where';

describe('loteWhere', () => {
  it('incluidos matches report candidates: Y/O/R, not excluded, not sent', () => {
    expect(loteWhere('incluidos')).toEqual({
      impact: { in: [...REPORT_CANDIDATE_IMPACTS] },
      excludedFromNextReport: false,
      reportItems: {
        none: { report: { status: ReportStatus.SENT } },
      },
    });
  });

  it('excluidos is the flag and not burned by a sent report', () => {
    expect(loteWhere('excluidos')).toEqual({
      excludedFromNextReport: true,
      reportItems: {
        none: { report: { status: ReportStatus.SENT } },
      },
    });
  });

  it('enviados is any finding on a sent report', () => {
    expect(loteWhere('enviados')).toEqual({
      reportItems: {
        some: { report: { status: ReportStatus.SENT } },
      },
    });
  });
});
