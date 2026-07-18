import { PrismaClient, SourceType, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

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
      status: 'ACTIVE',
    },
  });

  const sources = [
    {
      code: 'dof',
      name: 'Diario Oficial de la Federación',
      type: SourceType.DOF,
      url: 'https://www.dof.gob.mx/',
      jurisdiction: 'federal',
      frequency: 'daily',
      keywordsGuide: ['COFEPRIS', 'NOM', 'etiquetado', 'IEPS', 'bebidas'],
    },
    {
      code: 'diputados-gaceta',
      name: 'Gaceta Parlamentaria - Cámara de Diputados',
      type: SourceType.CONGRESS_FEDERAL,
      url: 'https://gaceta.diputados.gob.mx/',
      jurisdiction: 'federal',
      frequency: 'daily',
      keywordsGuide: ['Ley General de Salud', 'bebidas azucaradas', 'etiquetado'],
    },
    {
      code: 'jalisco-congreso',
      name: 'Congreso de Jalisco',
      type: SourceType.CONGRESS_STATE,
      url: 'https://www.congresojal.gob.mx/',
      jurisdiction: 'JAL',
      frequency: 'daily',
      keywordsGuide: ['bebidas', 'salud', 'publicidad', 'residuos'],
    },
  ];

  for (const source of sources) {
    await prisma.source.upsert({
      where: { code: source.code },
      update: { ...source, status: 'ACTIVE' },
      create: { ...source, status: 'ACTIVE' },
    });
  }

  // Placeholder admin linked after first Supabase login by email match/update.
  // Create only if an AUTH_SEED_USER_ID is provided.
  const seedAuthUserId = process.env.AUTH_SEED_USER_ID;
  const seedEmail = process.env.AUTH_SEED_EMAIL ?? 'admin@norma.local';

  if (seedAuthUserId) {
    const admin = await prisma.user.upsert({
      where: { authUserId: seedAuthUserId },
      update: {
        email: seedEmail.toLowerCase(),
        name: 'Admin NORMA',
        role: UserRole.ADMIN,
        status: 'ACTIVE',
      },
      create: {
        authUserId: seedAuthUserId,
        email: seedEmail.toLowerCase(),
        name: 'Admin NORMA',
        role: UserRole.ADMIN,
        status: 'ACTIVE',
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
  }

  console.log('Seed completed: Arca client, regulatory profile, pilot sources');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
