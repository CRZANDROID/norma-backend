import { EMPTY_QUEUE_COUNTS, QUEUE_COUNT_KEYS, toQueueCounts } from './queue-counts';

describe('toQueueCounts', () => {
  it('fills the thermometer keys with zeros when empty', () => {
    expect(toQueueCounts({})).toEqual(EMPTY_QUEUE_COUNTS);
    expect(Object.keys(toQueueCounts({})).sort()).toEqual(
      [...QUEUE_COUNT_KEYS].sort(),
    );
  });

  it('maps waiting from wait when waiting is missing', () => {
    expect(
      toQueueCounts({ wait: 4, active: 1, delayed: 0, failed: 2 }, 3, 0),
    ).toEqual({
      waiting: 4,
      active: 1,
      delayed: 0,
      failed: 2,
      paused: 0,
      stalled: 3,
    });
  });

  it('prefers waiting over wait and floors garbage to 0', () => {
    expect(
      toQueueCounts({
        waiting: 7,
        wait: 99,
        active: -1,
        delayed: Number.NaN,
        failed: 1.9,
        paused: 0,
      }),
    ).toEqual({
      waiting: 7,
      active: 0,
      delayed: 0,
      failed: 1,
      paused: 0,
      stalled: 0,
    });
  });
});
