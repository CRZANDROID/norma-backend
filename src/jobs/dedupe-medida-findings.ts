/**
 * Limpieza idempotente de Findings duplicados: mismo cliente y misma medida.
 *
 * Medida = misma URL sin sufijo de archivo (.html, .pdf, .docx, …), o el mismo
 * título de gaceta si la URL no alcanza para emparejar.
 *
 * Conserva un Finding por grupo: el que ya está en un informe DRAFT o SENT
 * (si hay varios, el más antiguo de esos). Si ninguno está en un informe,
 * el más antiguo. Borra solo los sobrantes. No borra Document. No toca un
 * hallazgo que es el único de su medida.
 *
 * Dry-run (no borra; es el default). Desde la raíz de norma-backend, con la
 * imagen de esta rama ya reconstruida (`docker compose up -d --build`):
 *
 *   docker compose exec api node dist/jobs/dedupe-medida-findings.js
 *
 * Aplicar el borrado:
 *
 *   docker compose exec api node dist/jobs/dedupe-medida-findings.js --apply
 */
import { PrismaClient, ReportStatus } from '../database/prisma-client';
import { crawlUrlFromMetadata } from './crawl-min-year';
import {
  chooseMedidaKeeper,
  groupByMedida,
  medidaTitleKey,
  medidaUrlKey,
  type MedidaRow,
} from './medida-key';

type Loaded = MedidaRow & { clientId: string };

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const findings = await prisma.finding.findMany({
      select: {
        id: true,
        clientId: true,
        title: true,
        createdAt: true,
        document: { select: { metadata: true } },
        reportItems: {
          where: {
            report: {
              status: { in: [ReportStatus.DRAFT, ReportStatus.SENT] },
            },
          },
          select: { id: true },
          take: 1,
        },
      },
    });

    const loaded: Loaded[] = findings.map((row) => ({
      id: row.id,
      clientId: row.clientId,
      title: row.title,
      url: crawlUrlFromMetadata(row.document.metadata),
      createdAt: row.createdAt,
      inReport: row.reportItems.length > 0,
    }));

    const byClient = new Map<string, Loaded[]>();
    for (const row of loaded) {
      const list = byClient.get(row.clientId);
      if (list) list.push(row);
      else byClient.set(row.clientId, [row]);
    }

    const surplus: string[] = [];
    let groups = 0;
    for (const [clientId, rows] of byClient) {
      for (const group of groupByMedida(rows)) {
        if (group.length < 2) continue;
        groups += 1;
        const keeper = chooseMedidaKeeper(group);
        const drop = group.filter((row) => row.id !== keeper.id);
        const label =
          medidaUrlKey(keeper.url) ??
          medidaTitleKey(keeper.title) ??
          keeper.id;
        console.log(
          [
            `cliente=${clientId}`,
            `medida=${label}`,
            `conserva=${keeper.id}`,
            `borra=${drop.map((row) => row.id).join(',')}`,
          ].join(' '),
        );
        surplus.push(...drop.map((row) => row.id));
      }
    }

    console.log(
      `grupos=${groups} sobrantes=${surplus.length} modo=${apply ? 'apply' : 'dry-run'}`,
    );
    if (!apply) {
      console.log('Dry-run: no se borró nada. Repite con --apply para borrar.');
      return;
    }
    if (surplus.length === 0) {
      console.log('Nada que borrar.');
      return;
    }
    const deleted = await prisma.finding.deleteMany({
      where: { id: { in: surplus } },
    });
    console.log(`Borrados=${deleted.count}. Document no se tocó.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
