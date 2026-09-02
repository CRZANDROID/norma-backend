import { JobErrorCode, JobRunStatus } from '../database/prisma-client';
import {
  ORIGIN_PAGE_PARTIAL,
  ORIGIN_PAGE_UNAVAILABLE,
  isOriginPageFailure,
} from './origin-page';

export type CrawlProgressStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'crawled'
  | 'failed'
  | 'skipped';

export const CRAWL_PROGRESS_LABELS: Record<CrawlProgressStatus, string> = {
  pending: 'Pendiente hoy',
  queued: 'Rastreando',
  running: 'Rastreando',
  crawled: 'Rastreada',
  failed: 'No se pudo rastrear',
  skipped: 'Omitida',
};

const FAIL_NOTE_BY_ERROR: Record<JobErrorCode, string> = {
  [JobErrorCode.NETWORK]: ORIGIN_PAGE_UNAVAILABLE,
  [JobErrorCode.PARSE]: 'No se pudo leer la página de la fuente.',
  [JobErrorCode.AUTH]: 'La página de la fuente pidió autenticación.',
  [JobErrorCode.RATE_LIMIT]: 'La página de la fuente rechazó por exceso de consultas.',
  [JobErrorCode.UNKNOWN]: 'No se pudo completar el rastreo.',
};

const TECHNICAL_FAIL_RE =
  /at \S+|Error:|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ECONNRESET|stack|AxiosError/i;

export function crawlFailNote(
  message: string | null | undefined,
  errorCode: JobErrorCode | null | undefined,
): string {
  const trimmed = message?.trim();
  if (trimmed && /demasiado grande/i.test(trimmed)) {
    return 'La página de la fuente es demasiado pesada para el rastreo actual.';
  }
  if (trimmed === ORIGIN_PAGE_PARTIAL || trimmed === ORIGIN_PAGE_UNAVAILABLE) {
    return trimmed;
  }
  if (isOriginPageFailure(trimmed) || errorCode === JobErrorCode.NETWORK) {
    return ORIGIN_PAGE_UNAVAILABLE;
  }
  if (trimmed && !TECHNICAL_FAIL_RE.test(trimmed) && trimmed.length <= 160) {
    return trimmed;
  }
  if (errorCode && FAIL_NOTE_BY_ERROR[errorCode]) {
    return FAIL_NOTE_BY_ERROR[errorCode];
  }
  return 'No se pudo completar el rastreo.';
}

export function crawlProgressFromRunStatus(
  status: JobRunStatus,
): CrawlProgressStatus {
  switch (status) {
    case JobRunStatus.QUEUED:
      return 'queued';
    case JobRunStatus.RUNNING:
      return 'running';
    case JobRunStatus.SUCCESS:
      return 'crawled';
    case JobRunStatus.FAILED:
      return 'failed';
    case JobRunStatus.SKIPPED:
      return 'skipped';
    default:
      return 'pending';
  }
}

export function crawlProgressLabel(status: CrawlProgressStatus): string {
  return CRAWL_PROGRESS_LABELS[status];
}

/** Nota ejecutiva para fallos y omisiones: español corto, sin stack ni errorCode. */
export function crawlProgressNote(
  status: CrawlProgressStatus,
  message: string | null | undefined,
  errorCode: JobErrorCode | null | undefined,
  extras: { hadFailedAttempt?: boolean } = {},
): string | null {
  if (status === 'failed') {
    return crawlFailNote(message, errorCode);
  }
  if (status === 'skipped') {
    if (message && /inactive/i.test(message)) {
      return 'La fuente está inactiva; no se rastreó.';
    }
    return 'El rastreo se omitió.';
  }
  if (status === 'crawled') {
    const trimmed = message?.trim();
    if (trimmed === ORIGIN_PAGE_PARTIAL || trimmed === ORIGIN_PAGE_UNAVAILABLE) {
      return trimmed;
    }
    if (isOriginPageFailure(trimmed)) {
      return ORIGIN_PAGE_PARTIAL;
    }
    if (extras.hadFailedAttempt) {
      return 'Un intento de hoy no se pudo completar. El último rastreo sí terminó.';
    }
  }
  return null;
}
