import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityStatus, Prisma } from '../../database/prisma-client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { assertClientAccess, isAdmin } from './client-access.util';
import type { CreateClientContactDto } from './dto/create-client-contact.dto';
import { CreateClientDto } from './dto/create-client.dto';
import type { FiscalDataDto } from './dto/fiscal-data.dto';
import { ListClientsQueryDto } from './dto/list-clients.query.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { shapeDeliveryConfig, toDeliveryWriteData } from './delivery.util';
import { shapeSchedule } from '../../common/dto/schedule.dto';

const clientDetailInclude = {
  fiscalData: true,
  deliveryConfig: true,
  contacts: { orderBy: { name: 'asc' as const } },
  profiles: { orderBy: { name: 'asc' as const } },
  clientSources: {
    include: {
      source: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.ClientInclude;

const clientListInclude = {
  fiscalData: true,
  deliveryConfig: true,
  contacts: { orderBy: { name: 'asc' as const } },
  clientSources: {
    include: { source: true },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.ClientInclude;

type ClientDetail = Prisma.ClientGetPayload<{
  include: typeof clientDetailInclude;
}>;

type ClientListItem = Prisma.ClientGetPayload<{
  include: typeof clientListInclude;
}>;

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthUser, query: ListClientsQueryDto) {
    const where: Prisma.ClientWhereInput = {};

    if (!isAdmin(user)) {
      const clientIds = user.memberships.map((m) => m.clientId);
      where.id = { in: clientIds };
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
      ];
    }

    const clients = await this.prisma.client.findMany({
      where,
      include: clientListInclude,
      orderBy: { name: 'asc' },
    });

    return clients.map((c) => this.shapeClient(c));
  }

  async findOne(user: AuthUser, id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: clientDetailInclude,
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    assertClientAccess(user, client.id);
    return this.shapeClient(client);
  }

  async create(dto: CreateClientDto) {
    const sourceIds = dto.sourceIds ?? [];
    await this.assertSourcesExist(sourceIds);
    const contactRows = this.toContactRows(dto.contacts);

    try {
      const client = await this.prisma.client.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          email: dto.email,
          phone: dto.phone,
          clientSources: sourceIds.length
            ? {
                create: sourceIds.map((sourceId) => ({ sourceId })),
              }
            : undefined,
          fiscalData: dto.fiscal
            ? { create: this.toFiscalCreateData(dto.fiscal) }
            : undefined,
          contacts: contactRows.length
            ? { create: contactRows }
            : undefined,
          deliveryConfig: {
            create: toDeliveryWriteData({
              emailEnabled: dto.delivery?.emailEnabled,
              whatsappEnabled: dto.delivery?.whatsappEnabled,
              schedule: dto.delivery?.schedule,
              impactActions: dto.delivery?.impactActions,
            }),
          },
        },
        include: clientDetailInclude,
      });
      return this.shapeClient(client);
    } catch (error) {
      this.rethrowUniqueConflict(error, 'Client slug already exists');
    }
  }

  async update(id: string, dto: UpdateClientDto) {
    await this.ensureExists(id);

    if (dto.sourceIds !== undefined) {
      await this.assertSourcesExist(dto.sourceIds);
    }

    const client = await this.prisma.$transaction(async (tx) => {
      if (dto.sourceIds !== undefined) {
        await tx.clientSource.deleteMany({ where: { clientId: id } });
        if (dto.sourceIds.length > 0) {
          await tx.clientSource.createMany({
            data: dto.sourceIds.map((sourceId) => ({
              clientId: id,
              sourceId,
            })),
          });
        }
      }

      if (dto.fiscal !== undefined) {
        const fiscal = this.toFiscalCreateData(dto.fiscal);
        await tx.clientFiscalData.upsert({
          where: { clientId: id },
          create: { clientId: id, ...fiscal },
          update: fiscal,
        });
      }

      if (dto.contacts !== undefined) {
        await tx.clientContact.deleteMany({ where: { clientId: id } });
        const contactRows = this.toContactRows(dto.contacts);
        if (contactRows.length > 0) {
          await tx.clientContact.createMany({
            data: contactRows.map((row) => ({
              clientId: id,
              ...row,
            })),
          });
        }
      }

      if (dto.delivery !== undefined) {
        const existing = await tx.clientDeliveryConfig.findUnique({
          where: { clientId: id },
        });
        const delivery = toDeliveryWriteData({
          emailEnabled: dto.delivery.emailEnabled,
          whatsappEnabled: dto.delivery.whatsappEnabled,
          schedule: dto.delivery.schedule,
          impactActions: dto.delivery.impactActions,
          fallback: existing
            ? {
                emailEnabled: existing.emailEnabled,
                whatsappEnabled: existing.whatsappEnabled,
                schedule: {
                  time: existing.deliveryTime,
                  timezone: existing.deliveryTimezone,
                  weekdays: existing.deliveryWeekdays,
                },
                impactActions: existing.impactActions,
              }
            : undefined,
        });
        await tx.clientDeliveryConfig.upsert({
          where: { clientId: id },
          create: { clientId: id, ...delivery },
          update: delivery,
        });
      }

      return tx.client.update({
        where: { id },
        data: {
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
        },
        include: clientDetailInclude,
      });
    });

    return this.shapeClient(client);
  }

  async deactivate(id: string) {
    await this.ensureExists(id);

    return this.prisma.client.update({
      where: { id },
      data: { status: EntityStatus.INACTIVE },
    });
  }

  async activate(id: string) {
    await this.ensureExists(id);

    return this.prisma.client.update({
      where: { id },
      data: { status: EntityStatus.ACTIVE },
    });
  }

  async ensureExists(id: string) {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    return client;
  }

  private shapeClient(client: ClientDetail | ClientListItem) {
    const { clientSources, deliveryConfig, ...rest } = client;
    return {
      ...rest,
      deliveryConfig: deliveryConfig
        ? shapeDeliveryConfig(deliveryConfig)
        : null,
      sources: clientSources.map((link) => {
        const {
          scheduleTime,
          scheduleTimezone,
          scheduleWeekdays,
          ...source
        } = link.source;
        return {
          ...source,
          schedule: shapeSchedule({
            time: scheduleTime,
            timezone: scheduleTimezone,
            weekdays: scheduleWeekdays,
          }),
        };
      }),
    };
  }

  private toFiscalCreateData(fiscal: FiscalDataDto) {
    return {
      legalName: fiscal.legalName.trim(),
      rfc: fiscal.rfc.trim().toUpperCase(),
      postalCode: fiscal.postalCode.trim(),
      cfdi: fiscal.cfdi.trim().toUpperCase(),
      taxRegime: fiscal.taxRegime.trim(),
    };
  }

  private toContactRows(contacts?: CreateClientContactDto[]) {
    if (!contacts?.length) {
      return [];
    }

    return contacts.map((c) => ({
      name: c.name.trim(),
      phone: c.phone.trim(),
      email: c.email?.trim(),
    }));
  }

  private async assertSourcesExist(sourceIds: string[]) {
    if (sourceIds.length === 0) return;

    const found = await this.prisma.source.findMany({
      where: { id: { in: sourceIds } },
      select: { id: true },
    });
    const foundIds = new Set(found.map((s) => s.id));
    const missing = sourceIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Source(s) not found: ${missing.join(', ')}`,
      );
    }
  }

  private rethrowUniqueConflict(error: unknown, message: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(message);
    }
    throw error;
  }
}
