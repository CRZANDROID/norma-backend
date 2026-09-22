import {
  describeDatabaseUrl,
  toPrismaTransactionUrl,
  withPrismaConnectionLimit,
  withPrismaRuntimeUrl,
} from './database-url';

describe('database-url', () => {
  const previous = process.env.DATABASE_CONNECTION_LIMIT;
  const session =
    'postgresql://postgres.ref:secret@aws-1-us-east-2.pooler.supabase.com:5432/postgres';

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.DATABASE_CONNECTION_LIMIT;
    } else {
      process.env.DATABASE_CONNECTION_LIMIT = previous;
    }
  });

  it('rewrites Supabase Session pooler to Transaction port 6543', () => {
    expect(toPrismaTransactionUrl(session)).toContain(
      'pooler.supabase.com:6543/postgres',
    );
    expect(toPrismaTransactionUrl(session)).not.toContain(':5432');
  });

  it('leaves a direct Postgres host on 5432', () => {
    const direct =
      'postgresql://postgres:secret@db.ref.supabase.co:5432/postgres';
    expect(toPrismaTransactionUrl(direct)).toBe(direct);
  });

  it('adds connection_limit so each Nest process does not exhaust the session pooler', () => {
    delete process.env.DATABASE_CONNECTION_LIMIT;
    const url = withPrismaConnectionLimit(session);
    expect(url).toContain('connection_limit=3');
    expect(url).toContain('pool_timeout=10');
    expect(url).toContain('pgbouncer=true');
  });

  it('does not override an explicit connection_limit in the URL', () => {
    const url = withPrismaConnectionLimit(
      'postgresql://u:p@host:5432/db?connection_limit=1',
    );
    expect(url).toContain('connection_limit=1');
    expect(url).not.toContain('connection_limit=3');
  });

  it('builds a Prisma runtime URL on the Transaction pooler with a small pool', () => {
    delete process.env.DATABASE_CONNECTION_LIMIT;
    const url = withPrismaRuntimeUrl(session);
    expect(url).toContain('pooler.supabase.com:6543/postgres');
    expect(url).toContain('connection_limit=3');
    expect(url).toContain('pgbouncer=true');
    expect(describeDatabaseUrl(url)).toBe(
      'aws-1-us-east-2.pooler.supabase.com:6543',
    );
  });
});
