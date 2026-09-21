export function parsePositiveInt(
  value: string | undefined,
  fallback: number,
): number {
  const n = Number(value?.trim());
  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }
  return Math.floor(n);
}

/** Crawl of a large gazette can take > 15 min at 200 pages. Default 30 min. */
export const DEFAULT_CRAWL_LOCK_MS = 30 * 60 * 1000;
/** Extract of huge PDFs / OpenAI classify can exceed the BullMQ default ~30 s lock. */
export const DEFAULT_DOCUMENT_LOCK_MS = 15 * 60 * 1000;
export const DEFAULT_LOCK_RENEW_MS = 15_000;
export const DEFAULT_QUEUE_CONCURRENCY = 2;
/** One Render restart should not exhaust the job; the failed handler still closes DB. */
export const DEFAULT_MAX_STALLED_COUNT = 2;
/** unpdf in a worker thread. After this, that PDF fails; crawl/classify keep the event loop. */
export const DEFAULT_PDF_EXTRACT_MS = 5 * 60 * 1000;

export function workerLockOptions(lockDuration: number): {
  lockDuration: number;
  lockRenewTime: number;
  maxStalledCount: number;
} {
  return {
    lockDuration,
    lockRenewTime: DEFAULT_LOCK_RENEW_MS,
    maxStalledCount: DEFAULT_MAX_STALLED_COUNT,
  };
}
