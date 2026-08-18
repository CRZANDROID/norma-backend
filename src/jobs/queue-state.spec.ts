import { redisJobIsInFlight } from './queue-state';

describe('redisJobIsInFlight', () => {
  it('treats waiting/active/delayed as in flight', () => {
    expect(redisJobIsInFlight('waiting')).toBe(true);
    expect(redisJobIsInFlight('active')).toBe(true);
    expect(redisJobIsInFlight('delayed')).toBe(true);
  });

  it('treats completed/failed/missing as not in flight', () => {
    expect(redisJobIsInFlight('completed')).toBe(false);
    expect(redisJobIsInFlight('failed')).toBe(false);
    expect(redisJobIsInFlight(null)).toBe(false);
    expect(redisJobIsInFlight(undefined)).toBe(false);
  });
});
