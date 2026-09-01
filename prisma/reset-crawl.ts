/**
 * Borra rastreo de prueba: documents de crawl + job_runs (+ findings de esos docs).
 * No toca sources, clients, users ni memberships.
 *
 *   pnpm exec tsx prisma/reset-crawl.ts
 *   pnpm exec tsx prisma/reset-crawl.ts dof diputados-gaceta
 *
 * Con Compose (Redis dentro de Docker):
 *   docker compose run --rm --entrypoint "" api ./node_modules/.bin/tsx prisma/reset-crawl.ts dof diputados-gaceta
 */
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from 'dotenv';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '../generated/prisma';

config();

const prisma = new PrismaClient();
const JOB_QUEUES = [
  'source.crawl',
  'document.extract',
  'document.normalize_dedup',
  'document.classify',
] as const;

function parseSourceCodes(argv: string[]): string[] {
  return argv
    .slice(2)
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
}

const crawlWhere = {
  OR: [
    { sourceId: { not: null } },
    { jobRunId: { not: null } },
    { path: { startsWith: 'raw/' } },
    { path: { startsWith: 'derived/' } },
  ],
};

async function withRedis<T>(
  fn: (redis: Redis) => Promise<T>,
): Promise<T | null> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    console.log('Redis: REDIS_URL vacío — colas no tocadas');
    return null;
  }

  const redis = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  try {
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

async function removeJobs(params: {
  crawlKeys: string[];
  documentIds: string[];
}): Promise<void> {
  await withRedis(async (redis) => {
    const queues = new Map<string, Queue>();
    try {
      for (const name of JOB_QUEUES) {
        queues.set(name, new Queue(name, { connection: redis.duplicate() }));
      }
      let removed = 0;
      const crawlQueue = queues.get('source.crawl');
      for (const key of params.crawlKeys) {
        const job = await crawlQueue?.getJob(key);
        if (job) {
          await job.remove();
          removed += 1;
        }
      }
      const extract = queues.get('document.extract');
      const normalize = queues.get('document.normalize_dedup');
      const classify = queues.get('document.classify');
      for (const id of params.documentIds) {
        const pairs: Array<[Queue | undefined, string]> = [
          [extract, `${id}:extract:v1`],
          [normalize, `${id}:normalize_dedup:v1`],
          [classify, `${id}:classify:v1`],
        ];
        for (const [queue, jobId] of pairs) {
          const job = await queue?.getJob(jobId);
          if (job) {
            await job.remove();
            removed += 1;
          }
        }
      }
      console.log(`Redis: ${removed} jobs quitados (resto de fuentes intacto)`);
      return removed;
    } finally {
      for (const queue of queues.values()) {
        const connection = queue.opts.connection;
        await queue.close();
        if (connection && typeof connection === 'object' && 'disconnect' in connection) {
          (connection as Redis).disconnect();
        }
      }
    }
  });
}

async function removeLocalArtifacts(sourceCodes?: string[]): Promise<void> {
  const root = join(process.cwd(), 'data', 'crawl');
  const targets = sourceCodes?.length
    ? sourceCodes.map((code) => join(root, 'raw', code))
    : [root];
  for (const dir of targets) {
    try {
      await rm(dir, { recursive: true, force: true });
      console.log(`Storage local: borrado ${dir}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Storage local: no se pudo borrar (${message})`);
    }
  }
}

async function resetAll(): Promise<void> {
  const beforeDocs = await prisma.document.count({ where: crawlWhere });
  const beforeRuns = await prisma.jobRun.count();
  const beforeFindings = await prisma.finding.count();
  const otherDocs = await prisma.document.count({
    where: { NOT: crawlWhere },
  });

  console.log(
    `Antes: ${beforeDocs} documentos de crawl, ${beforeRuns} job_runs, ${beforeFindings} findings, ${otherDocs} documentos no-crawl (se conservan)`,
  );

  await prisma.$transaction(async (tx) => {
    await tx.finding.deleteMany();
    await tx.document.deleteMany({
      where: { canonicalDocumentId: { not: null } },
    });
    await tx.document.deleteMany({ where: crawlWhere });
    await tx.jobRun.deleteMany();
  });

  await removeLocalArtifacts();
  await obliterateQueues();
}

async function resetSources(codes: string[]): Promise<void> {
  const sources = await prisma.source.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true, name: true },
  });
  const found = new Set(sources.map((s) => s.code));
  const missing = codes.filter((c) => !found.has(c));
  if (missing.length) {
    throw new Error(`Fuentes no encontradas: ${missing.join(', ')}`);
  }

  const sourceIds = sources.map((s) => s.id);
  const pathOr = codes.map((code) => ({ path: { startsWith: `raw/${code}/` } }));

  const docs = await prisma.document.findMany({
    where: {
      OR: [
        { sourceId: { in: sourceIds } },
        { jobRun: { sourceCode: { in: codes } } },
        ...pathOr,
      ],
    },
    select: { id: true },
  });
  const docIds = new Set(docs.map((d) => d.id));
  const dupes = await prisma.document.findMany({
    where: { canonicalDocumentId: { in: [...docIds] } },
    select: { id: true },
  });
  for (const d of dupes) {
    docIds.add(d.id);
  }
  const documentIds = [...docIds];

  const runs = await prisma.jobRun.findMany({
    where: {
      OR: [{ sourceId: { in: sourceIds } }, { sourceCode: { in: codes } }],
    },
    select: { id: true, idempotencyKey: true },
  });

  const findings = await prisma.finding.count({
    where: {
      OR: [{ sourceId: { in: sourceIds } }, { documentId: { in: documentIds } }],
    },
  });

  console.log(
    `Fuentes: ${sources.map((s) => s.code).join(', ')} — ${documentIds.length} documentos, ${runs.length} job_runs, ${findings} findings`,
  );

  await prisma.$transaction(async (tx) => {
    if (documentIds.length) {
      await tx.finding.deleteMany({
        where: {
          OR: [
            { sourceId: { in: sourceIds } },
            { documentId: { in: documentIds } },
          ],
        },
      });
      await tx.document.deleteMany({
        where: { canonicalDocumentId: { in: documentIds } },
      });
      await tx.document.deleteMany({ where: { id: { in: documentIds } } });
    }
    await tx.jobRun.deleteMany({
      where: {
        OR: [{ sourceId: { in: sourceIds } }, { sourceCode: { in: codes } }],
      },
    });
  });

  await removeLocalArtifacts(codes);
  await removeJobs({
    crawlKeys: runs.map((r) => r.idempotencyKey),
    documentIds,
  });
}

async function main() {
  const codes = parseSourceCodes(process.argv);
  if (codes.length) {
    await resetSources(codes);
  } else {
    await resetAll();
  }

  const afterDocs = await prisma.document.count();
  const afterRuns = await prisma.jobRun.count();
  const afterFindings = await prisma.finding.count();
  console.log(
    `Después: ${afterDocs} documentos, ${afterRuns} job_runs, ${afterFindings} findings`,
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
