/**
 * Borra findings de un cliente y reencola document.classify (classify-v2).
 * No toca crawl, documents raw ni extract.
 *
 *   pnpm exec tsx prisma/reclassify-client.ts
 *   pnpm exec tsx prisma/reclassify-client.ts --yes
 *   pnpm exec tsx prisma/reclassify-client.ts --slug=arca-continental --yes
 *
 * El API de Compose tiene que estar arriba (REDIS + OPENAI).
 */
import { config } from 'dotenv';
import { PrismaClient } from '../generated/prisma';

config();

const prisma = new PrismaClient();
const API_URL = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

function parseArgs(argv: string[]): { slug: string; yes: boolean } {
  let slug = 'arca-continental';
  let yes = false;
  for (const raw of argv.slice(2)) {
    const arg = raw.trim();
    if (arg === '--yes') {
      yes = true;
      continue;
    }
    if (arg.startsWith('--slug=')) {
      slug = arg.slice('--slug='.length).trim() || slug;
    }
  }
  return { slug, yes };
}

async function login(): Promise<string> {
  const email = process.env.AUTH_SEED_EMAIL ?? 'admin@norma.local';
  const password = process.env.AUTH_SEED_PASSWORD ?? 'ChangeMe123!';
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`login ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = (await res.json()) as { accessToken?: string };
  if (!body.accessToken) {
    throw new Error('login no devolvió accessToken');
  }
  return body.accessToken;
}

async function assertApiReady(token: string) {
  const jobs = await fetch(`${API_URL}/jobs/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!jobs.ok) {
    throw new Error(`GET /jobs/status ${jobs.status}`);
  }
  const status = (await jobs.json()) as {
    configured?: boolean;
    redis?: string;
  };
  if (!status.configured || status.redis !== 'up') {
    throw new Error(
      `Jobs no listos (configured=${status.configured} redis=${status.redis}).`,
    );
  }
  const ai = await fetch(`${API_URL}/ai/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!ai.ok) {
    throw new Error(`GET /ai/status ${ai.status}`);
  }
  const aiBody = (await ai.json()) as { configured?: boolean };
  if (!aiBody.configured) {
    throw new Error('OpenAI no configurado. Define OPENAI_API_KEY.');
  }
}

async function enqueueClassify(token: string, documentId: string) {
  const res = await fetch(`${API_URL}/documents/${documentId}/classify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!res.ok) {
    throw new Error(
      `classify ${documentId} → ${res.status} ${(await res.text()).slice(0, 240)}`,
    );
  }
}

async function main() {
  const { slug, yes } = parseArgs(process.argv);
  const client = await prisma.client.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });
  if (!client) {
    throw new Error(`Cliente no encontrado: ${slug}`);
  }

  const findings = await prisma.finding.findMany({
    where: { clientId: client.id },
    select: { documentId: true, impact: true },
  });
  const documentIds = [...new Set(findings.map((row) => row.documentId))];
  const counts = findings.reduce(
    (acc, row) => {
      acc[row.impact] = (acc[row.impact] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  console.log(
    `${client.name} (${client.slug}): ${findings.length} findings en ${documentIds.length} documentos`,
  );
  console.log(`impactos: ${JSON.stringify(counts)}`);
  if (!yes) {
    console.log('Dry-run. Para ejecutar: --yes');
    return;
  }

  const token = await login();
  await assertApiReady(token);

  const deleted = await prisma.finding.deleteMany({
    where: { clientId: client.id },
  });
  console.log(`borrados ${deleted.count} findings`);

  if (documentIds.length) {
    const reset = await prisma.document.updateMany({
      where: {
        id: { in: documentIds },
        canonicalDocumentId: null,
        processingStatus: { in: ['CLASSIFIED', 'READY_FOR_AI'] },
      },
      data: { processingStatus: 'READY_FOR_AI', lastError: null },
    });
    console.log(`documentos en READY_FOR_AI: ${reset.count}`);
  }

  let enqueued = 0;
  for (const documentId of documentIds) {
    await enqueueClassify(token, documentId);
    enqueued += 1;
    if (enqueued % 25 === 0 || enqueued === documentIds.length) {
      console.log(`encolados ${enqueued}/${documentIds.length}`);
    }
  }
  console.log(
    `listo: ${enqueued} classify en cola. Mira docker compose logs -f api`,
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
