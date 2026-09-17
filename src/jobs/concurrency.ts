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

/** Crawl can take minutes (many pages). Default 15 min. */
export const DEFAULT_CRAWL_LOCK_MS = 15 * 60 * 1000;
export const DEFAULT_CRAWL_LOCK_RENEW_MS = 15_000;
export const DEFAULT_QUEUE_CONCURRENCY = 2;
