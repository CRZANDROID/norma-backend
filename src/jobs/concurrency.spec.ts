import {
  DEFAULT_DOCUMENT_LOCK_MS,
  DEFAULT_LOCK_RENEW_MS,
  DEFAULT_MAX_STALLED_COUNT,
  DEFAULT_QUEUE_CONCURRENCY,
  parsePositiveInt,
  workerLockOptions,
} from './concurrency';

describe('parsePositiveInt', () => {
  it('returns the fallback for empty, zero, or garbage', () => {
    expect(parsePositiveInt(undefined, 2)).toBe(2);
    expect(parsePositiveInt('', 2)).toBe(2);
    expect(parsePositiveInt('0', 2)).toBe(2);
    expect(parsePositiveInt('-1', 2)).toBe(2);
    expect(parsePositiveInt('nope', 2)).toBe(2);
  });

  it('floors a positive number', () => {
    expect(parsePositiveInt('4', DEFAULT_QUEUE_CONCURRENCY)).toBe(4);
    expect(parsePositiveInt('3.9', 2)).toBe(3);
  });
});

describe('workerLockOptions', () => {
  it('pairs lockDuration with the shared renew interval', () => {
    expect(workerLockOptions(DEFAULT_DOCUMENT_LOCK_MS)).toEqual({
      lockDuration: DEFAULT_DOCUMENT_LOCK_MS,
      lockRenewTime: DEFAULT_LOCK_RENEW_MS,
      maxStalledCount: DEFAULT_MAX_STALLED_COUNT,
    });
  });
});
