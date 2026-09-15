import PDFDocument from 'pdfkit';
import { ImpactLevel } from '../../database/prisma-client';
import {
  IMPACT_REPORT_LABELS,
  REPORT_CANDIDATE_IMPACTS,
} from './reports.constants';

export type ReportPdfFinding = {
  title: string;
  impact: (typeof REPORT_CANDIDATE_IMPACTS)[number];
  suggestedAction: string | null;
  justification: string;
  sourceName: string | null;
  documentUrl: string | null;
  createdAt: Date;
};

export type ReportPdfInput = {
  clientName: string;
  legalName: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  generatedAt: Date;
  generatedByName: string;
  findings: ReportPdfFinding[];
};

const PAGE = {
  width: 595.28,
  height: 841.89,
  margin: 48,
  header: 36,
  footer: 44,
};
const NAVY = '#0D1B2A';
const INK = '#1C1917';
const MUTED = '#5B6573';
const RULE = '#E6E8EE';
const CARD = '#F4F6F9';
const LINK = '#1D4ED8';
const BAND_MUTED = '#C5CDD8';
const IMPACT_COLOR: Record<(typeof REPORT_CANDIDATE_IMPACTS)[number], string> = {
  [ImpactLevel.RED]: '#B42318',
  [ImpactLevel.ORANGE]: '#B54708',
  [ImpactLevel.YELLOW]: '#A15C07',
};

function contentWidth() {
  return PAGE.width - PAGE.margin * 2;
}

export function renderReportPdf(input: ReportPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: {
        top: PAGE.header + 12,
        left: PAGE.margin,
        right: PAGE.margin,
        bottom: PAGE.footer,
      },
      bufferPages: true,
      info: {
        Title: `Informe NORMA — ${input.clientName}`,
        Author: 'NORMA',
        Creator: 'NORMA',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawMasthead(doc);
    drawIntro(doc, input);
    const grouped = groupByImpact(input.findings);
    for (const impact of REPORT_CANDIDATE_IMPACTS) {
      const rows = grouped.get(impact) ?? [];
      if (rows.length === 0) {
        continue;
      }
      drawSectionHeader(doc, impact, rows.length);
      for (const finding of rows) {
        drawFinding(doc, finding);
      }
    }

    stampChrome(doc, input);
    doc.end();
  });
}

export function markdownToPdfText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-*]\s+/gm, '• ')
    .replace(/^\d+\.\s+/gm, '• ')
    .trim();
}

function drawMasthead(doc: PDFKit.PDFDocument) {
  doc.save();
  doc.rect(0, 0, PAGE.width, 38).fill(NAVY);
  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(9)
    .text('NORMA', PAGE.margin, 14, { lineBreak: false });
  const brandX = PAGE.margin + doc.widthOfString('NORMA') + 8;
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(BAND_MUTED)
    .text('·  Inteligencia regulatoria', brandX, 15, { lineBreak: false });
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#FFFFFF')
    .text('Documento de trabajo', PAGE.margin, 15, {
      width: contentWidth(),
      align: 'right',
      lineBreak: false,
    });
  doc.restore();
  doc.x = PAGE.margin;
  doc.y = 56;
}

function drawIntro(doc: PDFKit.PDFDocument, input: ReportPdfInput) {
  const width = contentWidth();
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(8)
    .text('INFORME DE SEGUIMIENTO REGULATORIO', PAGE.margin, doc.y, {
      width,
      characterSpacing: 0.6,
    });
  doc.moveDown(0.25);
  doc
    .fillColor(NAVY)
    .font('Helvetica-Bold')
    .fontSize(18)
    .text(input.clientName, { width });
  if (input.legalName && input.legalName !== input.clientName) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(MUTED)
      .text(input.legalName, { width });
  }

  const period = formatPeriod(input.dateFrom, input.dateTo);
  const generated = formatGeneratedAt(input.generatedAt);
  doc.moveDown(0.4);
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(MUTED)
    .text(`${period}  ·  ${generated}  ·  ${input.generatedByName}`, { width });

  doc.moveDown(0.7);
  drawCounters(doc, countByImpact(input.findings));

  doc.moveDown(0.45);
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(MUTED)
    .text(
      'Incluye únicamente hallazgos en semáforo amarillo, naranja y rojo. Los informativos no forman parte de este informe.',
      { width },
    );
  doc.moveDown(0.85);
}

function drawCounters(
  doc: PDFKit.PDFDocument,
  counts: { red: number; orange: number; yellow: number },
) {
  const items: Array<{
    label: string;
    n: number;
    color: string;
  }> = [
    {
      label: 'Crítico',
      n: counts.red,
      color: IMPACT_COLOR[ImpactLevel.RED],
    },
    {
      label: 'Alto',
      n: counts.orange,
      color: IMPACT_COLOR[ImpactLevel.ORANGE],
    },
    {
      label: 'Medio',
      n: counts.yellow,
      color: IMPACT_COLOR[ImpactLevel.YELLOW],
    },
  ];
  const gap = 8;
  const boxW = (contentWidth() - gap * 2) / 3;
  const boxH = 46;
  const y = doc.y;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const x = PAGE.margin + i * (boxW + gap);
    doc.save();
    doc.roundedRect(x, y, boxW, boxH, 6).fill(CARD);
    doc.restore();
    doc
      .fillColor(item.color)
      .font('Helvetica-Bold')
      .fontSize(16)
      .text(String(item.n), x, y + 8, {
        width: boxW,
        align: 'center',
        lineBreak: false,
      });
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(8)
      .text(item.label, x, y + 28, {
        width: boxW,
        align: 'center',
        lineBreak: false,
      });
  }
  doc.x = PAGE.margin;
  doc.y = y + boxH;
}

function drawSectionHeader(
  doc: PDFKit.PDFDocument,
  impact: (typeof REPORT_CANDIDATE_IMPACTS)[number],
  count: number,
) {
  ensureSpace(doc, 36);
  doc.x = PAGE.margin;
  const color = IMPACT_COLOR[impact];
  const label = IMPACT_REPORT_LABELS[impact].toUpperCase();
  doc
    .fillColor(color)
    .font('Helvetica-Bold')
    .fontSize(10)
    .text(`${label}    ${count}`, { width: contentWidth() });
  const y = doc.y + 3;
  doc.save();
  doc
    .strokeColor(color)
    .lineWidth(1.6)
    .moveTo(PAGE.margin, y)
    .lineTo(PAGE.margin + 64, y)
    .stroke();
  doc.restore();
  doc.y = y + 12;
}

function drawFinding(doc: PDFKit.PDFDocument, finding: ReportPdfFinding) {
  const x = PAGE.margin;
  const w = contentWidth();
  const innerX = x + 14;
  const innerW = w - 22;
  const pad = 10;
  const color = IMPACT_COLOR[finding.impact];
  const action = finding.suggestedAction?.trim() ?? '';
  const body = markdownToPdfText(finding.justification);
  const meta = [finding.sourceName, formatShortDate(finding.createdAt)]
    .filter(Boolean)
    .join('  ·  ');

  doc.font('Helvetica-Bold').fontSize(11);
  const titleH = doc.heightOfString(finding.title, { width: innerW });
  const metaH = meta ? 12 : 0;
  let actionH = 0;
  if (action) {
    doc.font('Helvetica').fontSize(9);
    actionH = 14 + doc.heightOfString(action, { width: innerW });
  }
  const headerH = pad + titleH + 4 + metaH + actionH + pad;

  ensureSpace(doc, Math.min(headerH + 28, 180));

  const y0 = doc.y;
  doc.save();
  doc.roundedRect(x, y0, w, headerH, 5).clip();
  doc.rect(x, y0, w, headerH).fill(CARD);
  doc.rect(x, y0, 4, headerH).fill(color);
  doc.restore();

  let cursor = y0 + pad;
  doc
    .fillColor(NAVY)
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(finding.title, innerX, cursor, { width: innerW });
  cursor += titleH + 4;
  if (meta) {
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(8)
      .text(meta, innerX, cursor, { width: innerW });
    cursor += metaH;
  }
  if (action) {
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('Acción sugerida', innerX, cursor, { width: innerW });
    cursor += 12;
    doc
      .fillColor(INK)
      .font('Helvetica')
      .fontSize(9)
      .text(action, innerX, cursor, { width: innerW });
  }

  doc.x = innerX;
  doc.y = y0 + headerH + 8;

  if (body) {
    doc
      .fillColor(MUTED)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('Justificación', innerX, doc.y, { width: innerW });
    doc.moveDown(0.15);
    doc
      .fillColor(INK)
      .font('Helvetica')
      .fontSize(9.5)
      .text(body, innerX, doc.y, {
        width: innerW,
        align: 'justify',
      });
    doc.moveDown(0.2);
  }

  if (finding.documentUrl) {
    doc
      .fillColor(LINK)
      .font('Helvetica')
      .fontSize(8.5)
      .text('Ver documento', innerX, doc.y, {
        link: finding.documentUrl,
        underline: true,
        width: innerW,
      });
  }

  doc.x = PAGE.margin;
  doc.moveDown(0.75);
}

function stampChrome(doc: PDFKit.PDFDocument, input: ReportPdfInput) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    if (i > 0) {
      doc.save();
      doc.rect(0, 0, PAGE.width, 32).fill(NAVY);
      doc
        .fillColor('#FFFFFF')
        .font('Helvetica-Bold')
        .fontSize(8)
        .text('NORMA', PAGE.margin, 12, { lineBreak: false });
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(BAND_MUTED)
        .text(`  ·  ${input.clientName}  ·  Informe`, {
          lineBreak: false,
        });
      doc.restore();
    }

    const y = PAGE.height - 28;
    doc.save();
    doc
      .strokeColor(RULE)
      .lineWidth(0.6)
      .moveTo(PAGE.margin, y)
      .lineTo(PAGE.width - PAGE.margin, y)
      .stroke();
    doc.fillColor(MUTED).font('Helvetica').fontSize(7.5);
    doc.text('No enviado al cliente', PAGE.margin, y + 8, {
      width: 150,
      lineBreak: false,
      height: 10,
    });
    doc.text(input.clientName, PAGE.margin + 150, y + 8, {
      width: contentWidth() - 220,
      align: 'center',
      lineBreak: false,
      height: 10,
    });
    doc.text(`${i + 1} / ${range.count}`, PAGE.width - PAGE.margin - 70, y + 8, {
      width: 70,
      align: 'right',
      lineBreak: false,
      height: 10,
    });
    doc.restore();
  }
}

function groupByImpact(
  findings: ReportPdfFinding[],
): Map<(typeof REPORT_CANDIDATE_IMPACTS)[number], ReportPdfFinding[]> {
  const map = new Map<
    (typeof REPORT_CANDIDATE_IMPACTS)[number],
    ReportPdfFinding[]
  >();
  for (const impact of REPORT_CANDIDATE_IMPACTS) {
    map.set(impact, []);
  }
  for (const finding of findings) {
    map.get(finding.impact)?.push(finding);
  }
  return map;
}

function countByImpact(findings: ReportPdfFinding[]) {
  return {
    red: findings.filter((row) => row.impact === ImpactLevel.RED).length,
    orange: findings.filter((row) => row.impact === ImpactLevel.ORANGE).length,
    yellow: findings.filter((row) => row.impact === ImpactLevel.YELLOW).length,
  };
}

function formatPeriod(from: string | null, to: string | null): string {
  if (!from && !to) {
    return 'Todos los hallazgos candidatos a la fecha de generación';
  }
  if (from && to && from === to) {
    return formatIsoDay(from);
  }
  if (from && to) {
    return `${formatIsoDay(from)} — ${formatIsoDay(to)}`;
  }
  if (from) {
    return `Desde ${formatIsoDay(from)}`;
  }
  return `Hasta ${formatIsoDay(to!)}`;
}

function formatIsoDay(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatGeneratedAt(date: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City',
  }).format(date);
}

function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Mexico_City',
  }).format(date);
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  const bottom = PAGE.height - PAGE.footer - 8;
  if (doc.y + needed > bottom) {
    doc.addPage();
  }
}
