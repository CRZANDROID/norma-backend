import { JobRunStatus } from '../database/prisma-client';
import {
  crawlDateFromIdempotencyKey,
  sameDayCrawlBlock,
  sameDayCrawlKeyPrefix,
} from './crawl-day-guard';

describe('crawl-day-guard', () => {
  it('parses the civil day out of scheduled and admin keys', () => {
    expect(crawlDateFromIdempotencyKey('dof:2026-09-22:scheduled')).toBe(
      '2026-09-22',
    );
    expect(crawlDateFromIdempotencyKey('dof:2026-09-22:admin')).toBe(
      '2026-09-22',
    );
    expect(crawlDateFromIdempotencyKey('weird')).toBeNull();
  });

  it('blocks admin enqueue when the scheduler already succeeded today', () => {
    const block = sameDayCrawlBlock([
      {
        id: 'run-sched',
        status: JobRunStatus.SUCCESS,
        idempotencyKey: 'dof:2026-09-22:scheduled',
      },
    ]);
    expect(block?.reason).toBe('already-completed');
    expect(block?.run.id).toBe('run-sched');
  });

  it('blocks a second crawl while another same-day run is queued', () => {
    const block = sameDayCrawlBlock([
      {
        id: 'run-admin',
        status: JobRunStatus.QUEUED,
        idempotencyKey: 'jalisco-congreso:2026-09-22:admin',
      },
    ]);
    expect(block?.reason).toBe('already-in-flight');
  });

  it('does not block retry when the only same-day run failed', () => {
    expect(
      sameDayCrawlBlock([
        {
          id: 'run-fail',
          status: JobRunStatus.FAILED,
          idempotencyKey: 'dof:2026-09-22:scheduled',
        },
      ]),
    ).toBeNull();
  });

  it('builds the prefix used to find both admin and scheduled keys', () => {
    expect(sameDayCrawlKeyPrefix('dof', '2026-09-22')).toBe('dof:2026-09-22:');
  });
});
