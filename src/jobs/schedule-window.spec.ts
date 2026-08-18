import {
  adminIdempotencyKey,
  isDueForScheduledCrawl,
  parseScheduleMinutes,
  scheduledIdempotencyKey,
  zonedClock,
} from './schedule-window';

describe('schedule-window', () => {
  const source = {
    scheduleTime: '07:00',
    scheduleTimezone: 'America/Mexico_City',
    scheduleWeekdays: [1, 2, 3, 4, 5],
  };

  it('parses HH:mm to minutes', () => {
    expect(parseScheduleMinutes('07:00')).toBe(420);
    expect(parseScheduleMinutes('00:00')).toBe(0);
    expect(parseScheduleMinutes('bad')).toBe(420);
  });

  it('is due at 07:00 Mexico on a weekday', () => {
    // 2026-08-18 is Tuesday. Mexico City is UTC-6 (no DST).
    const atSeven = new Date('2026-08-18T13:00:00.000Z');
    expect(zonedClock(atSeven, 'America/Mexico_City').isoWeekday).toBe(2);
    expect(isDueForScheduledCrawl(source, atSeven)).toBe(true);
  });

  it('is not due before schedule time', () => {
    const before = new Date('2026-08-18T12:59:00.000Z');
    expect(isDueForScheduledCrawl(source, before)).toBe(false);
  });

  it('is not due on Sunday even after 07:00', () => {
    const sunday = new Date('2026-08-16T15:00:00.000Z');
    expect(zonedClock(sunday, 'America/Mexico_City').isoWeekday).toBe(7);
    expect(isDueForScheduledCrawl(source, sunday)).toBe(false);
  });

  it('builds calendar idempotency keys in the source timezone', () => {
    const now = new Date('2026-08-18T13:00:00.000Z');
    expect(scheduledIdempotencyKey('dof', now, 'America/Mexico_City')).toBe(
      'dof:2026-08-18:scheduled',
    );
    expect(adminIdempotencyKey('dof', now, 'America/Mexico_City')).toBe(
      'dof:2026-08-18:admin',
    );
  });
});
