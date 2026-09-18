import { DocumentProcessingStatus } from '../database/prisma-client';
import {
  abandonedCrawlResolution,
  isFinalBullMqFailure,
  pipelineRequeueAction,
  redisJobIsAbandoned,
} from './job-lifetime';

describe('isFinalBullMqFailure', () => {
  it('treats stall exhaustion as terminal even if attempts remain', () => {
    expect(
      isFinalBullMqFailure(
        { attemptsMade: 1, opts: { attempts: 3 } },
        { message: 'job stalled more than allowable limit' },
      ),
    ).toBe(true);
  });

  it('is terminal when attempts are used up', () => {
    expect(
      isFinalBullMqFailure(
        { attemptsMade: 3, opts: { attempts: 3 } },
        { message: 'timeout' },
      ),
    ).toBe(true);
    expect(
      isFinalBullMqFailure(
        { attemptsMade: 1, opts: { attempts: 3 } },
        { message: 'timeout' },
      ),
    ).toBe(false);
  });
});

describe('abandoned crawl / pipeline', () => {
  it('does not close a job still in Redis', () => {
    expect(redisJobIsAbandoned('active')).toBe(false);
    expect(redisJobIsAbandoned('waiting')).toBe(false);
    expect(abandonedCrawlResolution('active', 0)).toBe('leave');
  });

  it('fails an interrupted crawl with no pages, or keeps what was saved', () => {
    expect(redisJobIsAbandoned(null)).toBe(true);
    expect(abandonedCrawlResolution('failed', 0)).toBe('failed');
    expect(abandonedCrawlResolution('failed', 4)).toBe('success-partial');
    expect(abandonedCrawlResolution(null, 1)).toBe('success-partial');
  });

  it('maps in-flight document statuses back onto the next queue', () => {
    expect(pipelineRequeueAction(DocumentProcessingStatus.RECEIVED)).toBe(
      'extract',
    );
    expect(pipelineRequeueAction(DocumentProcessingStatus.EXTRACTED)).toBe(
      'normalize',
    );
    expect(pipelineRequeueAction(DocumentProcessingStatus.READY_FOR_AI)).toBe(
      'classify',
    );
    expect(pipelineRequeueAction(DocumentProcessingStatus.CLASSIFIED)).toBeNull();
    expect(pipelineRequeueAction(DocumentProcessingStatus.FAILED)).toBeNull();
  });
});
