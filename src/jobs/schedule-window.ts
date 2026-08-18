const WEEKDAY_TO_ISO: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export type ScheduleLike = {
  scheduleTime: string;
  scheduleTimezone: string;
  scheduleWeekdays: number[];
};

export type ZonedClock = {
  date: string;
  hour: number;
  minute: number;
  isoWeekday: number;
};

function part(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((p) => p.type === type)?.value ?? '';
}

export function zonedClock(now: Date, timeZone: string): ZonedClock {
  let zone = timeZone?.trim() || 'America/Mexico_City';
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    }).formatToParts(now);
  } catch {
    zone = 'America/Mexico_City';
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    }).formatToParts(now);
  }

  const weekday = part(parts, 'weekday');
  const isoWeekday = WEEKDAY_TO_ISO[weekday] ?? 1;
  const year = part(parts, 'year');
  const month = part(parts, 'month');
  const day = part(parts, 'day');

  return {
    date: `${year}-${month}-${day}`,
    hour: Number(part(parts, 'hour')),
    minute: Number(part(parts, 'minute')),
    isoWeekday,
  };
}

export function parseScheduleMinutes(time: string): number {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time?.trim() || '');
  if (!match) {
    return 7 * 60;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/** True si el día coincide y la hora local ya alcanzó el disparador (catch-up). */
export function isDueForScheduledCrawl(
  source: ScheduleLike,
  now: Date = new Date(),
): boolean {
  const clock = zonedClock(now, source.scheduleTimezone);
  if (!source.scheduleWeekdays.includes(clock.isoWeekday)) {
    return false;
  }
  const current = clock.hour * 60 + clock.minute;
  return current >= parseScheduleMinutes(source.scheduleTime);
}

export function scheduledIdempotencyKey(
  sourceCode: string,
  now: Date,
  timeZone: string,
): string {
  const { date } = zonedClock(now, timeZone);
  return `${sourceCode}:${date}:scheduled`;
}

export function adminIdempotencyKey(
  sourceCode: string,
  now: Date,
  timeZone: string,
): string {
  const { date } = zonedClock(now, timeZone);
  return `${sourceCode}:${date}:admin`;
}

export function pathDateParts(now: Date, timeZone: string) {
  const { date } = zonedClock(now, timeZone);
  const [year, month, day] = date.split('-');
  return { year, month, day };
}
