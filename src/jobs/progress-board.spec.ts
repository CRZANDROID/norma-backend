import { trackingDaySummary } from './progress-board';

describe('trackingDaySummary', () => {
  it('treats pending as not done so a new day starts at 0', () => {
    expect(
      trackingDaySummary(
        ['pending', 'pending', 'pending'],
        ['extracting'],
      ),
    ).toEqual({ total: 3, pending: 3, inFlight: 0, done: 0 });
  });

  it('does not count the full catalog as done just because every ACTIVE source has a row', () => {
    expect(
      trackingDaySummary(
        ['classified', 'pending', 'extracting', 'ready'],
        ['extracting'],
      ),
    ).toEqual({ total: 4, pending: 1, inFlight: 1, done: 2 });
  });
});
