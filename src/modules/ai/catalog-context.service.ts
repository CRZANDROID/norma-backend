import { Injectable } from '@nestjs/common';
import { EntityStatus } from '../../database/prisma-client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { assertClientAccess, isAdmin } from '../clients/client-access.util';

export type CatalogStats = {
  clientCount: number;
  profileCount: number;
  sourceCount: number;
  scopedToClientId: string | null;
};

export type CatalogBundle = {
  catalog: Record<string, unknown>;
  stats: CatalogStats;
};

@Injectable()
export class CatalogContextService {
  constructor(private readonly prisma: PrismaService) {}

  async build(user: AuthUser, clientId?: string): Promise<CatalogBundle> {
    const scopedId = clientId?.trim() || undefined;
    if (scopedId) {
      assertClientAccess(user, scopedId);
    }

    const clientWhere = this.clientWhere(user, scopedId);
    const sourceWhere = this.sourceWhere(user, scopedId);

    const [clients, sources] = await Promise.all([
      this.prisma.client.findMany({
        where: clientWhere,
        orderBy: { name: 'asc' },
        take: 50,
        select: {
          name: true,
          slug: true,
          status: true,
          profiles: {
            where: { status: EntityStatus.ACTIVE },
            select: {
              name: true,
              keywords: true,
              categories: true,
            },
            orderBy: { name: 'asc' },
          },
          clientSources: {
            select: {
              source: {
                select: { code: true, name: true },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
          deliveryConfig: {
            select: {
              emailEnabled: true,
              whatsappEnabled: true,
              deliveryTime: true,
              deliveryTimezone: true,
              deliveryWeekdays: true,
            },
          },
        },
      }),
      this.prisma.source.findMany({
        where: sourceWhere,
        orderBy: { name: 'asc' },
        take: 90,
        select: {
          code: true,
          name: true,
          jurisdiction: true,
          stateCode: true,
          status: true,
          keywordsGuide: true,
          searchFocus: true,
          notes: true,
        },
      }),
    ]);

    const catalog = {
      clientes: clients.map((client) => ({
        nombre: client.name,
        identificador: client.slug,
        estado: client.status === EntityStatus.ACTIVE ? 'activo' : 'inactivo',
        perfiles: client.profiles.map((profile) => ({
          nombre: profile.name,
          palabrasClave: profile.keywords,
          categorias: profile.categories,
        })),
        fuentesVinculadas: client.clientSources.map((link) => ({
          identificador: link.source.code,
          nombre: link.source.name,
        })),
        entrega: client.deliveryConfig
          ? {
              correo: client.deliveryConfig.emailEnabled,
              whatsapp: client.deliveryConfig.whatsappEnabled,
              horario: client.deliveryConfig.deliveryTime,
              zona: client.deliveryConfig.deliveryTimezone,
              diasSemana: client.deliveryConfig.deliveryWeekdays,
            }
          : null,
      })),
      fuentes: sources.map((source) => ({
        identificador: source.code,
        nombre: source.name,
        ambito: source.jurisdiction === 'FEDERAL' ? 'federal' : 'estatal',
        entidadFederativa: source.stateCode,
        estado: source.status === EntityStatus.ACTIVE ? 'activo' : 'inactivo',
        queBuscar: source.searchFocus,
        observaciones: source.notes,
        palabrasGuia: source.keywordsGuide,
      })),
    };

    return {
      catalog,
      stats: {
        clientCount: clients.length,
        profileCount: clients.reduce((n, c) => n + c.profiles.length, 0),
        sourceCount: sources.length,
        scopedToClientId: scopedId ?? null,
      },
    };
  }

  private clientWhere(user: AuthUser, clientId?: string) {
    if (clientId) {
      return { id: clientId };
    }
    if (!isAdmin(user)) {
      return { id: { in: user.memberships.map((m) => m.clientId) } };
    }
    return {};
  }

  private sourceWhere(user: AuthUser, clientId?: string) {
    if (clientId) {
      return { clientSources: { some: { clientId } } };
    }
    if (!isAdmin(user)) {
      const ids = user.memberships.map((m) => m.clientId);
      return { clientSources: { some: { clientId: { in: ids } } } };
    }
    return {};
  }
}
