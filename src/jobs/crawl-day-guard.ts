import { JobRunStatus } from '../database/prisma-client';

export type SameDayCrawlRun = {
  id: string;
  status: JobRunStatus;
  idempotencyKey: string;
};

export function crawlDateFromIdempotencyKey(key: string): string | null {
  const match = /:(\d{4}-\d{2}-\d{2}):(?:admin|scheduled)$/.exec(key);
  return match?.[1] ?? null;
}

export function sameDayCrawlKeyPrefix(sourceCode: string, date: string): string {
  return `${sourceCode}:${date}:`;
}

/** Un SUCCESS/SKIPPED del cron no debe reabrirse con el botón admin (ni al revés). */
export function sameDayCrawlBlock(
  runs: SameDayCrawlRun[],
): { reason: 'already-completed' | 'already-in-flight'; run: SameDayCrawlRun } | null {
  const done = runs.find(
    (run) =>
      run.status === JobRunStatus.SUCCESS || run.status === JobRunStatus.SKIPPED,
  );
  if (done) {
    return { reason: 'already-completed', run: done };
  }
  const inFlight = runs.find(
    (run) =>
      run.status === JobRunStatus.QUEUED || run.status === JobRunStatus.RUNNING,
  );
  if (inFlight) {
    return { reason: 'already-in-flight', run: inFlight };
  }
  return null;
}
