const DEFAULT_CONNECTION_LIMIT = 3;
const DEFAULT_POOL_TIMEOUT_S = 10;
const SUPABASE_TRANSACTION_PORT = '6543';

function parseLimit(raw: string | undefined, fallback: number): number {
  const n = Number(raw?.trim());
  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }
  return Math.floor(n);
}

function setQueryParam(
  url: string,
  key: string,
  value: string,
  override = false,
): string {
  try {
    const parsed = new URL(url);
    if (override || !parsed.searchParams.has(key)) {
      parsed.searchParams.set(key, value);
    }
    return parsed.toString();
  } catch {
    if (!override && new RegExp(`[?&]${key}=`, 'i').test(url)) {
      return url;
    }
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}${key}=${encodeURIComponent(value)}`;
  }
}

/**
 * Session pooler (`:5432`, ~15 clientes globales) lo saturan Render + Docker.
 * El runtime de Prisma usa Transaction (`:6543`) y deja Session para `migrate`.
 */
export function toPrismaTransactionUrl(url: string): string {
  if (!/pooler\.supabase\.com/i.test(url)) {
    return url;
  }
  return url.replace(
    /(pooler\.supabase\.com):5432(?=\/|\?|$)/i,
    `$1:${SUPABASE_TRANSACTION_PORT}`,
  );
}

/** Host:puerto sin credenciales, para logs. */
export function describeDatabaseUrl(url: string | undefined): string {
  if (!url?.trim()) {
    return '(empty)';
  }
  const host = url.match(/@([^/?]+)/)?.[1];
  return host ?? '(unparseable)';
}

/** Session pooler de Supabase (pool_size ~15) no aguanta el default de Prisma por proceso. */
export function withPrismaConnectionLimit(
  url: string | undefined,
  limit = parseLimit(process.env.DATABASE_CONNECTION_LIMIT, DEFAULT_CONNECTION_LIMIT),
): string | undefined {
  if (!url?.trim()) {
    return url;
  }
  let next = url.trim();
  next = setQueryParam(next, 'connection_limit', String(limit));
  next = setQueryParam(next, 'pool_timeout', String(DEFAULT_POOL_TIMEOUT_S));
  if (/pooler\.supabase\.com/i.test(next)) {
    next = setQueryParam(next, 'pgbouncer', 'true');
  }
  return next;
}

/** URL para PrismaClient (Transaction + tope de pool). `migrate` sigue con `DATABASE_URL` crudo. */
export function withPrismaRuntimeUrl(
  url: string | undefined,
  limit = parseLimit(process.env.DATABASE_CONNECTION_LIMIT, DEFAULT_CONNECTION_LIMIT),
): string | undefined {
  if (!url?.trim()) {
    return url;
  }
  return withPrismaConnectionLimit(toPrismaTransactionUrl(url.trim()), limit);
}
