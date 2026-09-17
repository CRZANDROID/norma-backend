/**
 * Fuentes WEB del laboratorio de rendimiento (idempotente).
 *   pnpm exec tsx prisma/perf-lab-setup.ts
 */
import { config } from 'dotenv';
import {
  PrismaClient,
  SourceCategory,
  SourceJurisdiction,
  SourcePlatform,
} from '../generated/prisma';

config();

const prisma = new PrismaClient();

const SOURCES = [
  {
    code: 'perf-dof',
    name: 'PERF Diario Oficial de la Federación',
    url: 'https://www.dof.gob.mx/',
    jurisdiction: SourceJurisdiction.FEDERAL,
    stateCode: null,
  },
  {
    code: 'perf-diputados',
    name: 'PERF Gaceta Diputados',
    url: 'https://gaceta.diputados.gob.mx/',
    jurisdiction: SourceJurisdiction.FEDERAL,
    stateCode: null,
  },
  {
    code: 'perf-jalisco',
    name: 'PERF Congreso de Jalisco',
    url: 'https://www.congresojal.gob.mx/',
    jurisdiction: SourceJurisdiction.STATE,
    stateCode: 'JAL' as const,
  },
  {
    code: 'perf-agu',
    name: 'PERF Congreso de Aguascalientes',
    url: 'https://congresoags.gob.mx/',
    jurisdiction: SourceJurisdiction.STATE,
    stateCode: 'AGU' as const,
  },
  {
    code: 'perf-bc',
    name: 'PERF Congreso de Baja California',
    url: 'https://www.congresobc.gob.mx/',
    jurisdiction: SourceJurisdiction.STATE,
    stateCode: 'BCN' as const,
  },
];

async function main(): Promise<void> {
  for (const source of SOURCES) {
    const payload = {
      name: source.name,
      category: SourceCategory.OFFICIAL,
      platform: SourcePlatform.WEB,
      url: source.url,
      jurisdiction: source.jurisdiction,
      stateCode: source.stateCode,
      status: 'ACTIVE' as const,
    };
    await prisma.source.upsert({
      where: { code: source.code },
      update: payload,
      create: { code: source.code, ...payload },
    });
  }
  console.log(`perf-lab sources: ${SOURCES.map((s) => s.code).join(', ')}`);

  const client = await prisma.client.upsert({
    where: { slug: 'perf-lab' },
    update: { name: 'PERF Lab', status: 'ACTIVE' },
    create: {
      name: 'PERF Lab',
      slug: 'perf-lab',
      status: 'ACTIVE',
    },
  });
  for (const code of ['perf-dof', 'perf-diputados']) {
    const source = await prisma.source.findUnique({ where: { code } });
    if (!source) {
      continue;
    }
    await prisma.clientSource.upsert({
      where: {
        clientId_sourceId: { clientId: client.id, sourceId: source.id },
      },
      update: {},
      create: { clientId: client.id, sourceId: source.id },
    });
  }
  console.log(`perf-lab client ${client.slug} linked to perf-dof, perf-diputados`);
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
