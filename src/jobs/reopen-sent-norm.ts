import {
  FindingStatus,
  Prisma,
  ReportStatus,
} from '../database/prisma-client';
import { PrismaService } from '../database/prisma.service';
import { crawlUrlFromMetadata } from './crawl-min-year';

const NOTE_LIMIT = 700;

/** Identidad de la norma: misma URL, sin fragmento ni slash final. */
export function normIdentity(url: string | null | undefined): string | null {
  const raw = url?.trim();
  if (!raw) {
    return null;
  }
  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${parsed.search}`;
  } catch {
    return raw.toLowerCase().replace(/\/+$/, '');
  }
}

export function describeNormChange(input: {
  sentAt: Date | null;
  previousText: string;
  nextText: string;
}): string {
  const when = input.sentAt
    ? new Intl.DateTimeFormat('es-MX', {
        dateStyle: 'long',
        timeZone: 'America/Mexico_City',
      }).format(input.sentAt)
    : null;
  const lead = when
    ? `Esta norma ya se envió el ${when}. El nuevo rastreo trae otro contenido.`
    : 'Esta norma ya se envió. El nuevo rastreo trae otro contenido.';
  const added = novelSentences(input.nextText, input.previousText).slice(0, 2);
  const removed = novelSentences(input.previousText, input.nextText).slice(0, 1);
  const bits = [lead];
  if (added.length > 0) {
    bits.push(`Aparece: ${added.join(' ')}`);
  }
  if (removed.length > 0) {
    bits.push(`Ya no está: ${removed.join(' ')}`);
  }
  if (added.length === 0 && removed.length === 0) {
    bits.push('El texto normalizado ya no coincide con la versión enviada.');
  }
  return bits.join(' ').slice(0, NOTE_LIMIT);
}

/**
 * Si este documento es la misma norma (URL) que un hallazgo ya enviado y el
 * hash cambió, deja el hallazgo nuevo abierto y anota qué cambió para el PDF.
 */
export async function applySentNormReopen(
  prisma: PrismaService,
  input: {
    documentId: string;
    clientId: string;
    sourceId: string | null;
    contentHash: string | null;
    metadata: Prisma.JsonValue | null;
    extractedText: string | null;
  },
): Promise<string | null> {
  const identity = normIdentity(crawlUrlFromMetadata(input.metadata));
  if (!identity || !input.contentHash || !input.sourceId) {
    return null;
  }

  const priors = await prisma.finding.findMany({
    where: {
      clientId: input.clientId,
      sourceId: input.sourceId,
      documentId: { not: input.documentId },
      reportItems: { some: { report: { status: ReportStatus.SENT } } },
      document: {
        canonicalDocumentId: null,
        contentHash: { not: input.contentHash },
      },
    },
    select: {
      document: {
        select: {
          contentHash: true,
          extractedText: true,
          metadata: true,
        },
      },
      reportItems: {
        where: { report: { status: ReportStatus.SENT } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          report: { select: { sentAt: true, createdAt: true } },
        },
      },
    },
  });

  const matches = priors.filter((row) => {
    if (!row.document.contentHash || row.document.contentHash === input.contentHash) {
      return false;
    }
    return normIdentity(crawlUrlFromMetadata(row.document.metadata)) === identity;
  });
  matches.sort((a, b) => {
    const aAt = a.reportItems[0]?.report.sentAt ?? a.reportItems[0]?.report.createdAt ?? new Date(0);
    const bAt = b.reportItems[0]?.report.sentAt ?? b.reportItems[0]?.report.createdAt ?? new Date(0);
    return bAt.getTime() - aAt.getTime();
  });
  const match = matches[0];
  if (!match) {
    await prisma.finding.update({
      where: {
        documentId_clientId: {
          documentId: input.documentId,
          clientId: input.clientId,
        },
      },
      data: { changeNote: null },
    });
    return null;
  }

  const report = match.reportItems[0]?.report;
  const note = describeNormChange({
    sentAt: report?.sentAt ?? report?.createdAt ?? null,
    previousText: match.document.extractedText ?? '',
    nextText: input.extractedText ?? '',
  });
  await prisma.finding.update({
    where: {
      documentId_clientId: {
        documentId: input.documentId,
        clientId: input.clientId,
      },
    },
    data: {
      changeNote: note,
      status: FindingStatus.OPEN,
      excludedFromNextReport: false,
    },
  });
  return note;
}

function novelSentences(source: string, baseline: string): string[] {
  const known = new Set(sentences(baseline));
  return sentences(source)
    .filter((row) => !known.has(row))
    .map((row) => clip(row));
}

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((row) => row.trim())
    .filter((row) => row.length >= 24);
}

function clip(value: string, max = 140): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) {
    return clean;
  }
  return `${clean.slice(0, max - 1)}…`;
}
