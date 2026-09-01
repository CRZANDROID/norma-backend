import { DocumentProcessingStatus } from '../../database/prisma-client';

export type DocumentProgressStatus =
  | 'pending'
  | 'extracting'
  | 'ready'
  | 'classified'
  | 'unchanged'
  | 'unread'
  | 'failed';

export const DOCUMENT_PROGRESS_LABELS: Record<
  DocumentProgressStatus,
  string
> = {
  pending: 'Sin texto aún',
  extracting: 'Extrayendo texto',
  ready: 'Texto listo',
  classified: 'Clasificada',
  unchanged: 'Sin cambios (ya registrada)',
  unread: 'Rastreada, sin texto usable',
  failed: 'No se pudo extraer',
};

export const DOCUMENT_HEADLINE_MAX = 80;

const UNREAD_ERROR_RE =
  /umbral|captcha|vacío|sin texto visible|intersticial|too-short|HTML vacío|escaneado/i;

const TECHNICAL_EXTRACT_RE =
  /Extracción fallida|ECONNREFUSED|Storage|ENOENT|timeout|AxiosError/i;

export function documentProgressLabel(
  status: DocumentProgressStatus,
): string {
  return DOCUMENT_PROGRESS_LABELS[status];
}

export function documentHeadline(
  extractedText: string | null | undefined,
): string | null {
  const preview = (extractedText ?? '').replace(/\s+/g, ' ').trim();
  if (!preview) {
    return null;
  }
  return preview.slice(0, DOCUMENT_HEADLINE_MAX);
}

export function isUnreadExtractFailure(
  lastError: string | null | undefined,
): boolean {
  if (!lastError?.trim()) {
    return true;
  }
  if (TECHNICAL_EXTRACT_RE.test(lastError)) {
    return false;
  }
  return UNREAD_ERROR_RE.test(lastError);
}

export type DocumentDaySignals = {
  hadUnchanged: boolean;
  hadUnread: boolean;
  hadFailed: boolean;
};

export function documentDaySignals(
  rows: Array<{
    processingStatus: DocumentProcessingStatus;
    lastError?: string | null;
  }>,
): DocumentDaySignals {
  let hadUnchanged = false;
  let hadUnread = false;
  let hadFailed = false;
  for (const row of rows) {
    const mapped = mapDocumentPipelineStatus(
      row.processingStatus,
      row.lastError,
    );
    if (mapped === 'unchanged') {
      hadUnchanged = true;
    } else if (mapped === 'unread') {
      hadUnread = true;
    } else if (mapped === 'failed') {
      hadFailed = true;
    }
  }
  return { hadUnchanged, hadUnread, hadFailed };
}

/** Nota ejecutiva: duplicado y/o error, sin jerga de pipeline. */
export function documentProgressNote(
  status: DocumentProgressStatus,
  lastError: string | null | undefined,
  signals: DocumentDaySignals = {
    hadUnchanged: false,
    hadUnread: false,
    hadFailed: false,
  },
): string | null {
  const hadExtractProblem = signals.hadUnread || signals.hadFailed;
  const problemNote = signals.hadFailed
    ? 'Otro intento de hoy no se pudo extraer.'
    : 'Otro intento de hoy no trajo texto usable.';

  if (status === 'unchanged') {
    if (hadExtractProblem) {
      return `El contenido es el mismo que ya teníamos. ${problemNote}`;
    }
    return 'El contenido es el mismo que ya teníamos registrado.';
  }

  if (status === 'classified' && hadExtractProblem) {
    return `Hay texto clasificado. ${problemNote}`;
  }

  if (status === 'ready' && hadExtractProblem) {
    return `Hay texto listo. ${problemNote}`;
  }

  if (status === 'unread') {
    if (lastError && /escaneado/i.test(lastError)) {
      return 'Es un PDF escaneado (imagen). El archivo está guardado, pero no hay texto que extraer todavía.';
    }
    if (lastError && /captcha|intersticial/i.test(lastError)) {
      return 'La página pidió verificación y no trajo texto usable.';
    }
    if (signals.hadUnchanged) {
      return 'Esta pasada no trajo texto usable. El contenido anterior sigue registrado.';
    }
    return 'La página no trajo contenido suficiente para registrar.';
  }

  if (status === 'failed') {
    if (signals.hadUnchanged) {
      return 'No se pudo extraer el texto de esta pasada. El contenido anterior sigue registrado.';
    }
    return 'No se pudo extraer el texto.';
  }

  return null;
}

export function mapDocumentPipelineStatus(
  processingStatus: DocumentProcessingStatus,
  lastError?: string | null,
): DocumentProgressStatus {
  switch (processingStatus) {
    case DocumentProcessingStatus.CLASSIFIED:
      return 'classified';
    case DocumentProcessingStatus.READY_FOR_AI:
      return 'ready';
    case DocumentProcessingStatus.DEDUPED:
      return 'unchanged';
    case DocumentProcessingStatus.RECEIVED:
    case DocumentProcessingStatus.EXTRACTED:
    case DocumentProcessingStatus.NORMALIZED:
    case DocumentProcessingStatus.HASHED:
      return 'extracting';
    case DocumentProcessingStatus.FAILED:
      return isUnreadExtractFailure(lastError) ? 'unread' : 'failed';
    default:
      return 'pending';
  }
}

const PIPELINE_RANK: Record<DocumentProcessingStatus, number> = {
  [DocumentProcessingStatus.CLASSIFIED]: 110,
  [DocumentProcessingStatus.READY_FOR_AI]: 100,
  [DocumentProcessingStatus.HASHED]: 80,
  [DocumentProcessingStatus.NORMALIZED]: 70,
  [DocumentProcessingStatus.EXTRACTED]: 60,
  [DocumentProcessingStatus.RECEIVED]: 50,
  [DocumentProcessingStatus.DEDUPED]: 40,
  [DocumentProcessingStatus.FAILED]: 20,
  [DocumentProcessingStatus.DISCARDED]: 0,
};

export function documentPipelineRank(
  processingStatus: DocumentProcessingStatus,
): number {
  return PIPELINE_RANK[processingStatus] ?? 0;
}

export function preferHtmlFilename(filename: string): number {
  const name = filename.toLowerCase();
  if (name === 'page.html' || name === 'page.htm') {
    return 2;
  }
  if (name.endsWith('.html') || name.endsWith('.htm')) {
    return 1;
  }
  return 0;
}
