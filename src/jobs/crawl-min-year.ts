const DEFAULT_MIN_YEAR = 2026;
const YEAR_FLOOR = 1990;
const YEAR_CEILING = 2099;

/** Año civil mínimo del piloto (gacetas 2026+). `CRAWL_MIN_YEAR` lo pisa. */
export function resolveCrawlMinYear(): number {
  const raw = Number(process.env.CRAWL_MIN_YEAR);
  if (Number.isInteger(raw) && raw >= YEAR_FLOOR && raw <= YEAR_CEILING) {
    return raw;
  }
  return DEFAULT_MIN_YEAR;
}

const COMPACT_DATE_RE =
  /(?:^|[^\d])((?:199\d|20[0-2]\d)(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]))(?!\d)/g;
const YEAR_RE = /(?:^|[^\d])(199\d|20[0-2]\d)(?!\d)/g;

export function explicitYearsInText(text: string): number[] {
  const years = new Set<number>();
  collectYearsFromHaystack(text, years);
  return [...years];
}

function collectYearsFromHaystack(text: string, into: Set<number>) {
  const lower = text.toLowerCase();
  COMPACT_DATE_RE.lastIndex = 0;
  YEAR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = COMPACT_DATE_RE.exec(lower))) {
    into.add(Number(match[1].slice(0, 4)));
  }
  while ((match = YEAR_RE.exec(lower))) {
    into.add(Number(match[1]));
  }
}

/** True si la URL/nombre declara año(s) y todos son anteriores al mínimo. Sin año → false (portadas). */
export function urlIsBeforeMinYear(
  url: string,
  minYear = resolveCrawlMinYear(),
): boolean {
  const years = yearsFromUrlOrName(url);
  if (years.length === 0) {
    return false;
  }
  return years.every((year) => year < minYear);
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
