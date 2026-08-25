import { EntityStatus } from '../database/prisma-client';
import { PrismaService } from '../database/prisma.service';
import { PILOT_CONNECTOR_CODES } from './connectors/registry';

export type TrackingSource = {
  id: string;
  code: string;
  name: string;
};

/** Pilotos (aunque INACTIVE) + cualquier otra fuente ACTIVE. */
export async function listTrackingSources(
  prisma: PrismaService,
): Promise<TrackingSource[]> {
  const rows = await prisma.source.findMany({
    where: {
      OR: [
        { status: EntityStatus.ACTIVE },
        { code: { in: [...PILOT_CONNECTOR_CODES] } },
      ],
    },
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
