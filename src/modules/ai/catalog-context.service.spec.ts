import { EntityStatus, UserRole } from '../../database/prisma-client';
import type { AuthUser } from '../auth/auth.types';
import { CatalogContextService } from './catalog-context.service';

describe('CatalogContextService', () => {
  const prisma = {
    client: { findMany: jest.fn() },
    source: { findMany: jest.fn() },
  };
  const service = new CatalogContextService(prisma as never);

  const analyst: AuthUser = {
    id: 'analyst',
    email: 'ana@norma.local',
    name: 'Ana',
    role: UserRole.ANALYST,
    memberships: [
      {
        clientId: 'own',
        clientName: 'Propio',
        clientSlug: 'propio',
        role: UserRole.ANALYST,
      },
    ],
  };

  beforeEach(() => {
    prisma.client.findMany.mockReset();
    prisma.source.findMany.mockReset();
    prisma.client.findMany.mockResolvedValue([
      {
        name: 'Propio',
        slug: 'propio',
        status: EntityStatus.ACTIVE,
        profiles: [
          {
            name: 'Bebidas',
            description: 'La ficha sí muestra esto',
            keywords: ['refresco'],
            categories: ['salud'],
          },
        ],
        clientSources: [],
        deliveryConfig: null,
      },
    ]);
    prisma.source.findMany.mockResolvedValue([]);
  });

  it('gives a non-admin the global source catalog and only their clients', async () => {
    await service.build(analyst);

    expect(prisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['own'] } },
      }),
    );
    expect(prisma.source.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('sends the profile description the person can see', async () => {
    const { catalog } = await service.build(analyst);
    expect(catalog).toMatchObject({
      clientes: [
        {
          perfiles: [
            {
              nombre: 'Bebidas',
              descripcion: 'La ficha sí muestra esto',
            },
          ],
        },
      ],
    });
  });
});
