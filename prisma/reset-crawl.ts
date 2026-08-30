/**
 * Borra rastreo de prueba: documents de crawl + job_runs.
 * No toca sources, clients, users ni memberships.
 *
 *   pnpm exec tsx prisma/reset-crawl.ts
 */
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from 'dotenv';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '../generated/prisma';

config();

const prisma = new PrismaClient();
const CRAWL_QUEUES = [
  'source.crawl',
  'document.extract',
  'document.normalize_dedup',
] as const;

const crawlWhere = {
  OR: [
    { sourceId: { not: null } },
    { jobRunId: { not: null } },
    { path: { startsWith: 'raw/' } },
    { path: { startsWith: 'derived/' } },
  ],
};

async function obliterateQueues(): Promise<number> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    console.log('Redis: REDIS_URL vacío — colas no tocadas');
    return 0;
  }

  const redis = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  try {
    for (const name of CRAWL_QUEUES) {
      const connection = redis.duplicate();
      const queue = new Queue(name, { connection });
      await queue.obliterate({ force: true });
      await queue.close();
      connection.disconnect();
    }
    console.log(`Redis: colas vaciadas (${CRAWL_QUEUES.join(', ')})`);
    return CRAWL_QUEUES.length;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Redis: no se pudieron vaciar colas (${message})`);
    return 0;
  } finally {
    redis.disconnect();
  }
}

async function removeLocalArtifacts(): Promise<void> {
  const dir = join(process.cwd(), 'data', 'crawl');
  try {
    await rm(dir, { recursive: true, force: true });
    console.log(`Storage local: borrado ${dir}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Storage local: no se pudo borrar (${message})`);
  }
}

async function main() {
  const beforeDocs = await prisma.document.count({ where: crawlWhere });
  const beforeRuns = await prisma.jobRun.count();
  const otherDocs = await prisma.document.count({
    where: { NOT: crawlWhere },
  });

  console.log(
    `Antes: ${beforeDocs} documentos de crawl, ${beforeRuns} job_runs, ${otherDocs} documentos no-crawl (se conservan)`,
  );

  await prisma.$transaction(async (tx) => {
    // DEDUPED primero: si se anula canonical_document_id, el unique de content_hash choca.
    await tx.document.deleteMany({
      where: { canonicalDocumentId: { not: null } },
    });
    await tx.document.deleteMany({ where: crawlWhere });
    await tx.jobRun.deleteMany();
  });

  await removeLocalArtifacts();
  await obliterateQueues();

  const afterDocs = await prisma.document.count();
  const afterRuns = await prisma.jobRun.count();
  console.log(`Después: ${afterDocs} documentos, ${afterRuns} job_runs`);
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
