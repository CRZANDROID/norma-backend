import type { Queue } from 'bullmq';

export const QUEUE_COUNT_KEYS = [
  'waiting',
  'active',
  'delayed',
  'failed',
  'paused',
  'stalled',
] as const;

export type QueueCountKey = (typeof QUEUE_COUNT_KEYS)[number];

export type QueueCounts = Record<QueueCountKey, number>;

export const EMPTY_QUEUE_COUNTS: QueueCounts = {
  waiting: 0,
  active: 0,
  delayed: 0,
  failed: 0,
  paused: 0,
  stalled: 0,
};

function asCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Normaliza getJobCounts() de BullMQ al shape del termómetro. */
export function toQueueCounts(
  raw: Record<string, number> | null | undefined,
  stalled = 0,
  paused = 0,
): QueueCounts {
  const row = raw ?? {};
  return {
    waiting: asCount(row.waiting) || asCount(row.wait),
    active: asCount(row.active),
    delayed: asCount(row.delayed),
    failed: asCount(row.failed),
    paused: asCount(paused) || asCount(row.paused),
    stalled: asCount(stalled),
  };
}

export async function workerCountFromQueue(
  queue: Queue | null,
): Promise<number> {
  if (!queue) {
    return 0;
  }
  try {
    const workers = await queue.getWorkers();
    return workers.length;
  } catch {
    return 0;
  }
}

export async function countsFromQueue(
  queue: Queue | null,
): Promise<QueueCounts | null> {
  if (!queue) {
    return null;
  }
  try {
    const raw = await queue.getJobCounts(
      'wait',
      'waiting',
      'active',
      'delayed',
      'failed',
      'prioritized',
      'waiting-children',
    );
    const paused = (await queue.isPaused()) ? 1 : 0;
    return toQueueCounts(raw, 0, paused);
  } catch {
    return null;
  }
}
