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

/** Día civil del panel de rastreo (igual que el schedule de fuentes). */
export const TRACKING_TIMEZONE = 'America/Mexico_City';

const CALENDAR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidCalendarDate(ymd: string): boolean {
  if (!CALENDAR_DATE_RE.test(ymd)) {
    return false;
  }
  const [year, month, day] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

export function addCalendarDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utc.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Primer instante (UTC) del día civil `ymd` en `timeZone`. */
export function startOfZonedDay(
  ymd: string,
  timeZone = TRACKING_TIMEZONE,
): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  let t = Date.UTC(year, month - 1, day, 0, 0, 0) - 14 * 3600 * 1000;
  const limit = t + 40 * 3600 * 1000;
  let firstOfDay: Date | undefined;
  while (t <= limit) {
    const clock = zonedClock(new Date(t), timeZone);
    if (clock.date === ymd) {
      if (!firstOfDay) {
        firstOfDay = new Date(t);
      }
      if (clock.hour === 0 && clock.minute === 0) {
        return new Date(t);
      }
    }
    t += 60 * 1000;
  }
  if (firstOfDay) {
    return firstOfDay;
  }
  return new Date(`${ymd}T06:00:00.000Z`);
}

export function zonedDayRange(
  ymd: string,
  timeZone = TRACKING_TIMEZONE,
): { start: Date; end: Date } {
  return {
    start: startOfZonedDay(ymd, timeZone),
    end: startOfZonedDay(addCalendarDays(ymd, 1), timeZone),
  };
}

export function trackingCalendarDate(
  now: Date = new Date(),
  queryDate?: string,
): string {
  const date = queryDate?.trim();
  if (date) {
    return date;
  }
  return zonedClock(now, TRACKING_TIMEZONE).date;
}
