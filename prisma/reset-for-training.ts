/**
 * Wipe irreversible de negocio para capacitación.
 * Deja solo el ADMIN de AUTH_SEED_EMAIL. Borra clientes, fuentes, crawl,
 * hallazgos, informes, otros usuarios, colas Redis y el bucket Storage.
 *
 *   pnpm prisma:reset-training -- --yes
 *   docker compose run --rm --entrypoint "" api ./node_modules/.bin/tsx prisma/reset-for-training.ts --yes
 *
 * Sin --yes solo imprime el host y los conteos (dry-run).
 */
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from 'dotenv';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PrismaClient } from '../generated/prisma';

config();

const prisma = new PrismaClient();
const JOB_QUEUES = [
  'source.crawl',
  'document.extract',
  'document.normalize_dedup',
  'document.classify',
] as const;

function wantsYes(argv: string[]): boolean {
  return argv.slice(2).some((arg) => arg === '--yes' || arg === '-y');
}

function databaseTarget(url: string | undefined): string {
  if (!url?.trim()) {
    return '(DATABASE_URL vacío)';
  }
  try {
    const parsed = new URL(url);
    const db = parsed.pathname.replace(/^\//, '') || '(sin db)';
    return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}/${db}`;
  } catch {
    return '(DATABASE_URL no parseable)';
  }
}

async function counts() {
  return {
    users: await prisma.user.count(),
    clients: await prisma.client.count(),
    sources: await prisma.source.count(),
    findings: await prisma.finding.count(),
    documents: await prisma.document.count(),
    jobRuns: await prisma.jobRun.count(),
    reports: await prisma.report.count(),
    reportFindings: await prisma.reportFinding.count(),
    memberships: await prisma.clientMembership.count(),
  };
}

function printCounts(label: string, row: Awaited<ReturnType<typeof counts>>): void {
  console.log(
    `${label}: users=${row.users} clients=${row.clients} sources=${row.sources} ` +
      `findings=${row.findings} documents=${row.documents} job_runs=${row.jobRuns} ` +
      `reports=${row.reports} report_findings=${row.reportFindings} memberships=${row.memberships}`,
  );
}

async function withRedis<T>(
  fn: (redis: Redis) => Promise<T>,
): Promise<T | null> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    console.log('Redis: REDIS_URL vacío — colas no tocadas');
    return null;
  }

  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    connectTimeout: 3000,
    retryStrategy: () => null,
    lazyConnect: true,
  });
  try {
    await redis.connect();
    return await fn(redis);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Redis: no se pudieron vaciar colas (${message})`);
    return null;
  } finally {
    redis.disconnect();
  }
}

async function obliterateQueues(): Promise<void> {
  await withRedis(async (redis) => {
    for (const name of JOB_QUEUES) {
      const connection = redis.duplicate();
      const queue = new Queue(name, { connection });
      await queue.obliterate({ force: true });
      await queue.close();
      connection.disconnect();
    }
    console.log(`Redis: colas vaciadas (${JOB_QUEUES.join(', ')})`);
    return JOB_QUEUES.length;
  });
}

async function removeLocalArtifacts(): Promise<void> {
  const root = join(process.cwd(), 'data', 'crawl');
  try {
    await rm(root, { recursive: true, force: true });
    console.log(`Storage local: borrado ${root}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Storage local: no se pudo borrar (${message})`);
  }
}

function storageClient(): { client: SupabaseClient; bucket: string } | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'documents';
  if (!url || !key) {
    console.log('Storage: SUPABASE_* vacío — bucket no tocado');
    return null;
  }
  return { client: createClient(url, key, { auth: { persistSession: false } }), bucket };
}

async function listStoragePaths(
  client: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;
  const pageSize = 100;

  for (;;) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
    });
    if (error) {
      throw new Error(`Storage list ${prefix || '/'}: ${error.message}`);
    }
    if (!data?.length) {
      break;
    }
    for (const item of data) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      const isFolder = item.id == null;
      if (isFolder) {
        paths.push(...(await listStoragePaths(client, bucket, full)));
      } else {
        paths.push(full);
      }
    }
    if (data.length < pageSize) {
      break;
    }
    offset += data.length;
  }

  return paths;
}

async function emptyStorageBucket(): Promise<void> {
  const configured = storageClient();
  if (!configured) {
    return;
  }
  const { client, bucket } = configured;
  try {
    console.log('Storage: vaciando bucket…');
    const { error } = await client.storage.emptyBucket(bucket);
    if (error) {
      throw new Error(error.message);
    }
    console.log(`Storage: bucket ${bucket} vaciado (emptyBucket)`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Storage: emptyBucket falló (${message}); intento borrar por listado`);
    try {
      const paths = await listStoragePaths(client, bucket, '');
      if (!paths.length) {
        console.log(`Storage: bucket ${bucket} ya vacío`);
        return;
      }
      const chunkSize = 100;
      for (let i = 0; i < paths.length; i += chunkSize) {
        const chunk = paths.slice(i, i + chunkSize);
        const { error } = await client.storage.from(bucket).remove(chunk);
        if (error) {
          throw new Error(error.message);
        }
      }
      console.log(`Storage: ${paths.length} objetos borrados en ${bucket}`);
    } catch (fallbackErr) {
      const fallbackMessage =
        fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      console.warn(`Storage: no se pudo vaciar el bucket (${fallbackMessage})`);
    }
  }
}

async function wipeBusiness(adminEmail: string): Promise<void> {
  const admin = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true, email: true, role: true },
  });
  if (!admin) {
    throw new Error(
      `No hay usuario ${adminEmail}. Abortado: el wipe no dejaría login.`,
    );
  }

  await prisma.reportFinding.deleteMany();
  await prisma.report.deleteMany();
  await prisma.finding.deleteMany();
  await prisma.document.deleteMany({
    where: { canonicalDocumentId: { not: null } },
  });
  await prisma.document.deleteMany();
  await prisma.jobRun.deleteMany();
  await prisma.client.deleteMany();
  await prisma.source.deleteMany();
  const otherUsers = await prisma.user.deleteMany({
    where: { id: { not: admin.id } },
  });
  console.log(
    `DB: negocio vaciado. Conservado ADMIN ${admin.email} (${admin.role}). Usuarios extra borrados: ${otherUsers.count}`,
  );
}

async function main(): Promise<void> {
  const adminEmail = (
    process.env.AUTH_SEED_EMAIL ?? 'admin@norma.local'
  ).toLowerCase();
  const apply = wantsYes(process.argv);

  console.log(`Target DB: ${databaseTarget(process.env.DATABASE_URL)}`);
  console.log(`ADMIN a conservar: ${adminEmail}`);
  printCounts('Antes', await counts());

  if (!apply) {
    console.log(
      'Dry-run. Para borrar de verdad: pnpm prisma:reset-training -- --yes',
    );
    console.log(
      'Después del wipe no corras pnpm prisma:seed sin SEED_CATALOG=false: volvería Arca y las fuentes.',
    );
    return;
  }

  await wipeBusiness(adminEmail);
  await removeLocalArtifacts();
  await emptyStorageBucket();
  await obliterateQueues();
  printCounts('Después', await counts());
  console.log(
    'Listo. No corras pnpm prisma:seed (recrea catálogo) salvo SEED_CATALOG=false.',
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
