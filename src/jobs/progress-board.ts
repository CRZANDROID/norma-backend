import { EntityStatus, JobRunStatus } from '../database/prisma-client';
import { PrismaService } from '../database/prisma.service';
import { PILOT_CONNECTOR_CODES } from './connectors/registry';

export type TrackingSource = {
  id: string;
  code: string;
  name: string;
};

/** Solo fuentes ACTIVE. INACTIVE no entra al tablero (el archivo sigue en documents/findings). */
export async function listTrackingSources(
  prisma: PrismaService,
): Promise<TrackingSource[]> {
  const rows = await prisma.source.findMany({
    where: { status: EntityStatus.ACTIVE },
    select: { id: true, code: true, name: true },
  });

  const byCode = new Map(rows.map((row) => [row.code, row]));
  const ordered: TrackingSource[] = [];
  for (const code of PILOT_CONNECTOR_CODES) {
    const row = byCode.get(code);
    if (row) {
      ordered.push(row);
      byCode.delete(code);
    }
  }
  const rest = [...byCode.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'es'),
  );
  return [...ordered, ...rest];
}

/** Crawl del día aún en cola o ejecutándose: extract/análisis no se marcan terminados. */
export async function loadCrawlInFlightSourceIds(
  prisma: PrismaService,
  date: string,
  sourceIds: string[],
): Promise<Set<string>> {
  if (sourceIds.length === 0) {
    return new Set();
  }
  const runs = await prisma.jobRun.findMany({
    where: {
      sourceId: { in: sourceIds },
      type: 'source.crawl',
      idempotencyKey: { contains: `:${date}:` },
      status: { in: [JobRunStatus.QUEUED, JobRunStatus.RUNNING] },
    },
    select: { sourceId: true },
  });
  const ids = new Set<string>();
  for (const run of runs) {
    if (run.sourceId) {
      ids.add(run.sourceId);
    }
  }
  return ids;
}
