/**
 * Lab de rendimiento: login, encola crawl(s), poll health + colas.
 * No imprime el token.
 *
 *   pnpm exec tsx prisma/perf-lab-run.ts --code=perf-dof --rounds=24
 *   pnpm exec tsx prisma/perf-lab-run.ts --all --rounds=48
 */
import { config } from 'dotenv';

config();

const API = process.env.PERF_API_URL?.trim() || 'http://localhost:3000';
const ALL_CODES = [
  'perf-dof',
  'perf-diputados',
  'perf-jalisco',
  'perf-agu',
  'perf-bc',
];

function arg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

type QueueCounts = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  paused: number;
  stalled: number;
};

function summarizeQueues(
  queues: Record<string, QueueCounts | null> | undefined,
): string {
  if (!queues) {
    return 'queues=missing';
  }
  return Object.entries(queues)
    .map(([name, counts]) => {
      if (!counts) {
        return `${name}=null`;
      }
      return `${name} w=${counts.waiting} a=${counts.active} f=${counts.failed} s=${counts.stalled}`;
    })
    .join(' | ');
}

function progressLine(
  sources: Array<{ sourceName: string; status: string }> | undefined,
): string {
  const rows = (sources ?? []).filter((s) => s.sourceName.startsWith('PERF '));
  if (!rows.length) {
    return 'no-perf-row';
  }
  return rows
    .map((s) => `${s.sourceName.replace('PERF ', '')}:${s.status}`)
    .join(',');
}

function allPerfSettled(
  sources: Array<{ sourceName: string; status: string }> | undefined,
  expected: number,
): boolean {
  const rows = (sources ?? []).filter((s) => s.sourceName.startsWith('PERF '));
  if (rows.length < expected) {
    return false;
  }
  return rows.every((s) =>
    ['crawled', 'failed', 'skipped'].includes(s.status),
  );
}

async function main(): Promise<void> {
  const all = hasFlag('all');
  const codes = all ? ALL_CODES : [arg('code', 'perf-dof')];
  const rounds = Number(arg('rounds', all ? '48' : '24')) || 24;
  const email = process.env.AUTH_SEED_EMAIL;
  const password = process.env.AUTH_SEED_PASSWORD;
  if (!email || !password) {
    throw new Error('AUTH_SEED_EMAIL / AUTH_SEED_PASSWORD required');
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

  for (const code of codes) {
    const trigger = await fetch(`${API}/jobs/crawl`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ sourceCode: code }),
    });
    const triggerBody = (await trigger.json()) as {
      enqueued?: boolean;
      skipped?: boolean;
      reason?: string;
    };
    console.log(
      `crawl ${code} http=${trigger.status} enqueued=${triggerBody.enqueued} skipped=${triggerBody.skipped} reason=${triggerBody.reason ?? ''}`,
    );
  }

  let maxHealthMs = 0;
  let healthFails = 0;
  let lastProgress = '';

  for (let i = 1; i <= rounds; i += 1) {
    const t0 = Date.now();
    try {
      const health = await fetch(`${API}/health`);
      const healthMs = Date.now() - t0;
      maxHealthMs = Math.max(maxHealthMs, healthMs);
      if (!health.ok) {
        healthFails += 1;
      }
      const status = await fetch(`${API}/jobs/status`, { headers });
      const statusBody = (await status.json()) as {
        worker?: boolean;
        consumers?: Record<string, number>;
        queues?: Record<string, QueueCounts | null>;
      };
      const progress = await fetch(`${API}/jobs/progress`, { headers });
      const progressBody = (await progress.json()) as {
        sources?: Array<{ sourceName: string; status: string }>;
      };
      lastProgress = progressLine(progressBody.sources);
      const crawlConsumers = statusBody.consumers?.['source.crawl'] ?? 0;
      console.log(
        `#${i} health=${health.ok ? 'ok' : health.status} ${healthMs}ms worker=${statusBody.worker} crawlConsumers=${crawlConsumers} ${lastProgress} ${summarizeQueues(statusBody.queues)}`,
      );
      const crawl = statusBody.queues?.['source.crawl'];
      const idle = !crawl || (crawl.waiting === 0 && crawl.active === 0);
      if (
        health.ok &&
        idle &&
        allPerfSettled(progressBody.sources, codes.length)
      ) {
        break;
      }
    } catch (err) {
      healthFails += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.log(`#${i} poll-error ${message}`);
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }

  console.log(
    `summary maxHealthMs=${maxHealthMs} healthFails=${healthFails} lastProgress=${lastProgress}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
