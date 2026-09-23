const DEFAULT_MIN_YEAR = 2026;
const YEAR_FLOOR = 1990;
const YEAR_CEILING = 2099;
const DATELINE_CHARS = 2000;

/** Año civil mínimo del piloto (gacetas 2026+). `CRAWL_MIN_YEAR` lo pisa. */
export function resolveCrawlMinYear(): number {
  const raw = Number(process.env.CRAWL_MIN_YEAR);
  if (Number.isInteger(raw) && raw >= YEAR_FLOOR && raw <= YEAR_CEILING) {
    return raw;
  }
  return DEFAULT_MIN_YEAR;
}

const COMPACT_YMD_RE =
  /(?:^|[^\d])((?:199\d|20[0-2]\d)(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]))(?!\d)/g;
const COMPACT_DMY_RE =
  /(?:^|[^\d])((?:0[1-9]|[12]\d|3[01])(?:0[1-9]|1[0-2])(?:199\d|20[0-2]\d))(?!\d)/g;
const YEAR_RE = /(?:^|[^\d])(199\d|20[0-2]\d)(?!\d)/g;

const SPANISH_MONTHS =
  'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';
const SPANISH_DATE_RE = new RegExp(
  `(?:^|[^\\p{L}\\d])(\\d{1,2})\\s+de\\s+(?:${SPANISH_MONTHS})\\s+(?:de\\s+)?(199\\d|20[0-2]\\d)`,
  'giu',
);
const SLASH_DATE_RE =
  /(?:^|[^\d])(?:0?[1-9]|[12]\d|3[01])[/-](?:0?[1-9]|1[0-2])[/-](199\d|20[0-2]\d)(?!\d)/g;
const ISO_DATE_RE = /(199\d|20[0-2]\d)-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])/g;

export function explicitYearsInText(text: string): number[] {
  const years = new Set<number>();
  collectYearsFromHaystack(text, years);
  return [...years];
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (year < YEAR_FLOOR || year > YEAR_CEILING) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

function collectYearsFromHaystack(text: string, into: Set<number>) {
  const lower = text.toLowerCase();
  COMPACT_YMD_RE.lastIndex = 0;
  COMPACT_DMY_RE.lastIndex = 0;
  YEAR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = COMPACT_YMD_RE.exec(lower))) {
    const raw = match[1];
    const year = Number(raw.slice(0, 4));
    const month = Number(raw.slice(4, 6));
    const day = Number(raw.slice(6, 8));
    if (isValidYmd(year, month, day)) {
      into.add(year);
    }
  }
  while ((match = COMPACT_DMY_RE.exec(lower))) {
    const raw = match[1];
    const day = Number(raw.slice(0, 2));
    const month = Number(raw.slice(2, 4));
    const year = Number(raw.slice(4, 8));
    if (isValidYmd(year, month, day)) {
      into.add(year);
    }
  }
  while ((match = YEAR_RE.exec(lower))) {
    into.add(Number(match[1]));
  }
}

function yearsAreAllBeforeMin(years: number[], minYear: number): boolean {
  return years.length > 0 && years.every((year) => year < minYear);
}

/** True si la URL/nombre declara año(s) y todos son anteriores al mínimo. Sin año → false (portadas). */
export function urlIsBeforeMinYear(
  url: string,
  minYear = resolveCrawlMinYear(),
): boolean {
  const years = yearsFromUrlOrName(url);
  return yearsAreAllBeforeMin(years, minYear);
}

function yearsFromUrlOrName(value: string): number[] {
  const years = new Set<number>();
  try {
    const parsed = new URL(value);
    collectYearsFromHaystack(decodeURIComponent(parsed.pathname), years);
    collectYearsFromHaystack(parsed.search, years);
  } catch {
    collectYearsFromHaystack(value, years);
  }
  return [...years];
}

export function crawlUrlFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const record = metadata as Record<string, unknown>;
  for (const key of ['finalUrl', 'url', 'externalRef'] as const) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export function crawlResourceIsBeforeMinYear(params: {
  url?: string | null;
  filename?: string | null;
  minYear?: number;
}): boolean {
  const minYear = params.minYear ?? resolveCrawlMinYear();
  if (params.url?.trim() && urlIsBeforeMinYear(params.url.trim(), minYear)) {
    return true;
  }
  if (
    params.filename?.trim() &&
    urlIsBeforeMinYear(params.filename.trim(), minYear)
  ) {
    return true;
  }
  return false;
}

/** Años de publicación en la apertura del texto (no citas a leyes viejas más abajo). */
export function yearsFromDateline(text: string): number[] {
  const window = text.slice(0, DATELINE_CHARS);
  const years = new Set<number>();
  SPANISH_DATE_RE.lastIndex = 0;
  SLASH_DATE_RE.lastIndex = 0;
  ISO_DATE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SPANISH_DATE_RE.exec(window))) {
    years.add(Number(match[2]));
  }
  while ((match = SLASH_DATE_RE.exec(window))) {
    years.add(Number(match[1]));
  }
  while ((match = ISO_DATE_RE.exec(window))) {
    years.add(Number(match[1]));
  }
  return [...years];
}

export function resourceIsBeforeMinYear(params: {
  url?: string | null;
  filename?: string | null;
  extractedText?: string | null;
  minYear?: number;
}): boolean {
  const minYear = params.minYear ?? resolveCrawlMinYear();
  if (
    crawlResourceIsBeforeMinYear({
      url: params.url,
      filename: params.filename,
      minYear,
    })
  ) {
    return true;
  }
  return yearsAreAllBeforeMin(yearsFromDateline(params.extractedText ?? ''), minYear);
}
