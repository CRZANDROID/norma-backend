/**
 * Fase classify: reencola canónicos de perf-dof / perf-diputados y poll la cola.
 *   pnpm exec tsx prisma/perf-lab-classify.ts
 */
import { config } from 'dotenv';
import { PrismaClient } from '../generated/prisma';

config();

const API = process.env.PERF_API_URL?.trim() || 'http://localhost:3000';
const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.AUTH_SEED_EMAIL;
  const password = process.env.AUTH_SEED_PASSWORD;
  if (!email || !password) {
    throw new Error('AUTH_SEED_EMAIL / AUTH_SEED_PASSWORD required');
  }

  const docs = await prisma.document.findMany({
    where: {
      canonicalDocumentId: null,
      processingStatus: { in: ['READY_FOR_AI', 'CLASSIFIED'] },
      source: { code: { in: ['perf-dof', 'perf-diputados'] } },
    },
    select: { id: true, processingStatus: true },
    take: 8,
    orderBy: { createdAt: 'desc' },
  });
  console.log(`canonical docs to classify: ${docs.length}`);
  if (!docs.length) {
    return;
  }

  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const session = (await login.json()) as { accessToken?: string };
  if (!login.ok || !session.accessToken) {
    throw new Error(`login ${login.status}`);
  }
  const headers = { authorization: `Bearer ${session.accessToken}` };

  for (const doc of docs) {
    const res = await fetch(`${API}/documents/${doc.id}/classify`, {
      method: 'POST',
      headers,
    });
    console.log(`classify ${doc.id} was=${doc.processingStatus} http=${res.status}`);
  }

  let maxHealthMs = 0;
  let sawFailed = 0;
  for (let i = 1; i <= 18; i += 1) {
    const t0 = Date.now();
    const health = await fetch(`${API}/health`);
    const healthMs = Date.now() - t0;
    maxHealthMs = Math.max(maxHealthMs, healthMs);
    const status = await fetch(`${API}/jobs/status`, { headers });
    const body = (await status.json()) as {
      queues?: Record<string, { waiting: number; active: number; failed: number } | null>;
    };
    const q = body.queues?.['document.classify'];
    sawFailed = Math.max(sawFailed, q?.failed ?? 0);
    console.log(
      `#${i} health=${health.ok ? 'ok' : health.status} ${healthMs}ms classify w=${q?.waiting ?? '?'} a=${q?.active ?? '?'} f=${q?.failed ?? '?'}`,
    );
    if (q && q.waiting === 0 && q.active === 0) {
      break;
    }
    await new Promise((r) => setTimeout(r, 8000));
  }

  const findings = await prisma.finding.count({
    where: { client: { slug: 'perf-lab' } },
  });
  console.log(
    `summary maxHealthMs=${maxHealthMs} classifyFailed=${sawFailed} findings=${findings}`,
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
