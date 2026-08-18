import * as bcrypt from 'bcryptjs';
import {
  MexicanState,
  PrismaClient,
  SourceCategory,
  SourceJurisdiction,
  SourcePlatform,
  UserRole,
} from '../generated/prisma';
import { MATRIX_EXTRA_SOURCES } from './data/matrix-extra-sources';
import { CONGRESS_KEYWORDS, STATE_CONGRESSES } from './data/state-congresses';

const prisma = new PrismaClient();

const DEFAULT_SCHEDULE = {
  scheduleTime: '07:00',
  scheduleTimezone: 'America/Mexico_City',
  scheduleWeekdays: [1, 2, 3, 4, 5],
};

/** Texto de matriz VCGA → string[] (mismo shape que keywordsGuide). */
function toSearchFocus(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

const DEFAULT_IMPACT_ACTIONS = [
  {
    impact: 'GREEN',
    notifyInbox: true,
    sendEmail: false,
    sendWhatsapp: false,
    requireHumanApproval: false,
    suggestedAction: 'Registrar como contexto',
  },
  {
    impact: 'YELLOW',
    notifyInbox: true,
    sendEmail: true,
    sendWhatsapp: false,
    requireHumanApproval: true,
    suggestedAction: 'Dar seguimiento',
  },
  {
    impact: 'ORANGE',
    notifyInbox: true,
    sendEmail: true,
    sendWhatsapp: false,
    requireHumanApproval: true,
    suggestedAction: 'Elaborar nota y monitorear avance',
  },
  {
    impact: 'RED',
    notifyInbox: true,
    sendEmail: true,
    sendWhatsapp: true,
    requireHumanApproval: true,
    suggestedAction: 'Alertar de inmediato y preparar nota ejecutiva',
  },
];

async function main() {
  const arca = await prisma.client.upsert({
    where: { slug: 'arca-continental' },
    update: {
      name: 'Arca Continental',
      status: 'ACTIVE',
    },
    create: {
      name: 'Arca Continental',
      slug: 'arca-continental',
      email: 'asuntos.regulatorios@arca.com',
      status: 'ACTIVE',
    },
  });

  await prisma.regulatoryProfile.upsert({
    where: { id: 'seed-arca-profile' },
    update: {
      name: 'Perfil bebidas y empaques',
      keywords: [
        'bebidas azucaradas',
        'refrescos',
        'etiquetado',
        'IEPS',
        'PET',
        'publicidad infantil',
        'escuelas',
        'COFEPRIS',
      ],
      categories: ['salud', 'etiquetado', 'impuestos', 'envases', 'publicidad'],
      products: {
        categories: ['refrescos', 'aguas', 'jugos', 'bebidas saborizadas'],
      },
      status: 'ACTIVE',
    },
    create: {
      id: 'seed-arca-profile',
      clientId: arca.id,
      name: 'Perfil bebidas y empaques',
      description:
        'Perfil inicial del piloto NORMA para Arca Continental / Coca-Cola México',
      keywords: [
        'bebidas azucaradas',
        'refrescos',
        'etiquetado',
        'IEPS',
        'PET',
        'publicidad infantil',
        'escuelas',
        'COFEPRIS',
      ],
      categories: ['salud', 'etiquetado', 'impuestos', 'envases', 'publicidad'],
      products: {
        categories: ['refrescos', 'aguas', 'jugos', 'bebidas saborizadas'],
      },
    },
  });

  const federalSources = [
    {
      code: 'dof',
      name: 'Diario Oficial de la Federación',
      url: 'https://www.dof.gob.mx/',
      sections: [
        ['Secretaría de Salud'],
        ['COFEPRIS'],
        ['Economía'],
        ['SHCP'],
        ['PROFECO'],
        ['SEMARNAT'],
        ['CONAGUA'],
        ['SEP'],
        ['Presidencia'],
      ],
      keywordsGuide: [
        'COFEPRIS',
        'NOM',
        'etiquetado',
        'aditivos',
        'colorantes',
        'edulcorantes',
        'bebidas',
        'alimentos',
        'publicidad',
        'IEPS',
        'envases',
        'residuos',
        'agua',
      ],
      searchFocus:
        'Decretos, acuerdos, NOM, proyectos de NOM, reformas, lineamientos, criterios regulatorios o avisos oficiales',
      notes: 'Matriz operativa #5. Reportar si genera obligación, restricción o plazo.',
      scheduleWeekdays: [1, 2, 3, 4, 5],
      status: 'ACTIVE' as const,
    },
    {
      code: 'diputados-gaceta',
      name: 'Gaceta Parlamentaria - Cámara de Diputados',
      url: 'https://gaceta.diputados.gob.mx/',
      sections: [
        ['Iniciativas'],
        ['Dictámenes'],
        ['Proposiciones'],
        ['Minutas'],
        ['Orden del día'],
      ],
      keywordsGuide: [
        'Ley General de Salud',
        'IEPS',
        'etiquetado',
        'COFEPRIS',
        'PROFECO',
        'bebidas azucaradas',
        'ultraprocesados',
      ],
      searchFocus:
        'Nuevas iniciativas federales o dictámenes relacionados con salud, alimentos, bebidas, IEPS, etiquetado, publicidad, escuelas, residuos o consumidores',
      notes: 'Matriz operativa #2.',
      scheduleWeekdays: [1, 2, 3, 4, 5],
      status: 'ACTIVE' as const,
    },
  ];

  for (const source of federalSources) {
    const { scheduleWeekdays, status, searchFocus, ...rest } = source;
    const searchFocusList = toSearchFocus(searchFocus);
    await prisma.source.upsert({
      where: { code: source.code },
      update: {
        ...rest,
        searchFocus: searchFocusList,
        category: SourceCategory.OFFICIAL,
        platform: SourcePlatform.WEB,
        jurisdiction: SourceJurisdiction.FEDERAL,
        stateCode: null,
        scheduleTime: DEFAULT_SCHEDULE.scheduleTime,
        scheduleTimezone: DEFAULT_SCHEDULE.scheduleTimezone,
        scheduleWeekdays,
        status,
      },
      create: {
        ...rest,
        searchFocus: searchFocusList,
        category: SourceCategory.OFFICIAL,
        platform: SourcePlatform.WEB,
        jurisdiction: SourceJurisdiction.FEDERAL,
        scheduleTime: DEFAULT_SCHEDULE.scheduleTime,
        scheduleTimezone: DEFAULT_SCHEDULE.scheduleTimezone,
        scheduleWeekdays,
        status,
      },
    });
  }

  for (const extra of MATRIX_EXTRA_SOURCES) {
    const { scheduleWeekdays, status, searchFocus, ...rest } = extra;
    const searchFocusList = toSearchFocus(searchFocus);
    await prisma.source.upsert({
      where: { code: extra.code },
      update: {
        ...rest,
        searchFocus: searchFocusList,
        category: SourceCategory.OFFICIAL,
        platform: SourcePlatform.WEB,
        jurisdiction: SourceJurisdiction.FEDERAL,
        stateCode: null,
        scheduleTime: DEFAULT_SCHEDULE.scheduleTime,
        scheduleTimezone: DEFAULT_SCHEDULE.scheduleTimezone,
        scheduleWeekdays,
        status,
      },
      create: {
        ...rest,
        searchFocus: searchFocusList,
        category: SourceCategory.OFFICIAL,
        platform: SourcePlatform.WEB,
        jurisdiction: SourceJurisdiction.FEDERAL,
        scheduleTime: DEFAULT_SCHEDULE.scheduleTime,
        scheduleTimezone: DEFAULT_SCHEDULE.scheduleTimezone,
        scheduleWeekdays,
        status,
      },
    });
  }

  for (const congress of STATE_CONGRESSES) {
    const payload = {
      name: congress.name,
      category: SourceCategory.OFFICIAL,
      platform: SourcePlatform.WEB,
      url: congress.url,
      jurisdiction: SourceJurisdiction.STATE,
      stateCode: congress.stateCode as MexicanState,
      scheduleTime: DEFAULT_SCHEDULE.scheduleTime,
      scheduleTimezone: DEFAULT_SCHEDULE.scheduleTimezone,
      scheduleWeekdays: congress.weekdays,
      sections: congress.sections,
      keywordsGuide: CONGRESS_KEYWORDS,
      searchFocus: toSearchFocus(congress.searchFocus),
      notes: congress.notes,
      status: congress.active ? ('ACTIVE' as const) : ('INACTIVE' as const),
    };

    await prisma.source.upsert({
      where: { code: congress.code },
      update: payload,
      create: { code: congress.code, ...payload },
    });
  }

  const seedEmail = (process.env.AUTH_SEED_EMAIL ?? 'admin@norma.local').toLowerCase();
  const seedPassword = process.env.AUTH_SEED_PASSWORD ?? 'ChangeMe123!';
  const passwordHash = await bcrypt.hash(seedPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: seedEmail },
    update: {
      name: 'Admin NORMA',
      role: UserRole.ADMIN,
      status: 'ACTIVE',
      passwordHash,
    },
    create: {
      email: seedEmail,
      name: 'Admin NORMA',
      role: UserRole.ADMIN,
      status: 'ACTIVE',
      passwordHash,
    },
  });

  await prisma.clientMembership.upsert({
    where: {
      userId_clientId: {
        userId: admin.id,
        clientId: arca.id,
      },
    },
    update: { role: UserRole.ADMIN, status: 'ACTIVE' },
    create: {
      userId: admin.id,
      clientId: arca.id,
      role: UserRole.ADMIN,
      status: 'ACTIVE',
    },
  });

  await prisma.clientFiscalData.upsert({
    where: { clientId: arca.id },
    update: {
      legalName: 'Arca Continental, S.A.B. de C.V.',
      rfc: 'ACA800101AA1',
      postalCode: '66260',
      cfdi: 'G03',
      taxRegime: '601',
    },
    create: {
      clientId: arca.id,
      legalName: 'Arca Continental, S.A.B. de C.V.',
      rfc: 'ACA800101AA1',
      postalCode: '66260',
      cfdi: 'G03',
      taxRegime: '601',
    },
  });

  await prisma.clientDeliveryConfig.upsert({
    where: { clientId: arca.id },
    update: {
      emailEnabled: true,
      whatsappEnabled: false,
      deliveryTime: DEFAULT_SCHEDULE.scheduleTime,
      deliveryTimezone: DEFAULT_SCHEDULE.scheduleTimezone,
      deliveryWeekdays: [...DEFAULT_SCHEDULE.scheduleWeekdays],
      impactActions: DEFAULT_IMPACT_ACTIONS,
    },
    create: {
      clientId: arca.id,
      emailEnabled: true,
      whatsappEnabled: false,
      deliveryTime: DEFAULT_SCHEDULE.scheduleTime,
      deliveryTimezone: DEFAULT_SCHEDULE.scheduleTimezone,
      deliveryWeekdays: [...DEFAULT_SCHEDULE.scheduleWeekdays],
      impactActions: DEFAULT_IMPACT_ACTIONS,
    },
  });

  const existingContact = await prisma.clientContact.findFirst({
    where: { clientId: arca.id, email: 'asuntos.regulatorios@arca.com' },
  });
  if (!existingContact) {
    await prisma.clientContact.create({
      data: {
        clientId: arca.id,
        name: 'Asuntos Regulatorios Arca',
        phone: '+52 81 8151 1400',
        email: 'asuntos.regulatorios@arca.com',
        status: 'ACTIVE',
      },
    });
  }

  console.log(
    `Seed completed: Arca (+ fiscal/contact/delivery), DOF+Diputados ACTIVE, Senado/mañanera/COFEPRIS/PROFECO INACTIVE, 32 congresos, admin ${seedEmail}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
