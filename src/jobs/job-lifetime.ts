import { DocumentProcessingStatus } from '../database/prisma-client';

export const EXTRACT_INTERRUPTED =
  'Extracción fallida: el worker se interrumpió antes de terminar.';
export const NORMALIZE_INTERRUPTED =
  'Normalización fallida: el worker se interrumpió antes de terminar.';
export const CLASSIFY_INTERRUPTED =
  'Clasificación: el análisis se interrumpió antes de terminar.';

const STALL_EXHAUSTED_RE = /stalled more than allowable/i;

/** Redis states that mean nobody will run this job unless we re-enqueue. */
const ABANDONED_REDIS_STATES = new Set([
  'failed',
  'completed',
  'unknown',
]);

export function isFinalBullMqFailure(
  job:
    | {
        attemptsMade?: number;
        opts?: { attempts?: number };
      }
    | undefined
    | null,
  err: { message?: string },
): boolean {
  if (STALL_EXHAUSTED_RE.test(err.message ?? '')) {
    return true;
  }
  if (!job) {
    return true;
  }
  const max = job.opts?.attempts ?? 1;
  const made = job.attemptsMade ?? 0;
  return made >= max;
}

export function redisJobIsAbandoned(
  state: string | null | undefined,
): boolean {
  return !state || ABANDONED_REDIS_STATES.has(state);
}

export function pipelineRequeueAction(
  status: DocumentProcessingStatus,
): 'extract' | 'normalize' | 'classify' | null {
  switch (status) {
    case DocumentProcessingStatus.RECEIVED:
      return 'extract';
    case DocumentProcessingStatus.EXTRACTED:
    case DocumentProcessingStatus.NORMALIZED:
    case DocumentProcessingStatus.HASHED:
      return 'normalize';
    case DocumentProcessingStatus.READY_FOR_AI:
      return 'classify';
    default:
      return null;
  }
}

export function abandonedCrawlResolution(
  redisState: string | null | undefined,
  savedDocuments: number,
): 'leave' | 'success-partial' | 'failed' {
  if (!redisJobIsAbandoned(redisState)) {
    return 'leave';
  }
  return savedDocuments > 0 ? 'success-partial' : 'failed';
}
