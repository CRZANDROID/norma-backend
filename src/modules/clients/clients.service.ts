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
import { CreateClientDto } from './dto/create-client.dto';
import { ListClientsQueryDto } from './dto/list-clients.query.dto';
import { UpdateClientDto } from './dto/update-client.dto';

const clientWithSources = {
  profiles: { orderBy: { name: 'asc' as const } },
  clientSources: {
    include: {
      source: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.ClientInclude;

type ClientWithSources = Prisma.ClientGetPayload<{
  include: typeof clientWithSources;
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
      include: {
        clientSources: { include: { source: true }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });

    return clients.map((c) => this.shapeClient(c));
  }

  async findOne(user: AuthUser, id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: clientWithSources,
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
        },
        include: clientWithSources,
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

      return tx.client.update({
        where: { id },
        data: {
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
        },
        include: clientWithSources,
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

  private shapeClient(
    client:
      | ClientWithSources
      | Prisma.ClientGetPayload<{
          include: {
            clientSources: { include: { source: true } };
          };
        }>,
  ) {
    const { clientSources, ...rest } = client;
    return {
      ...rest,
      sources: clientSources.map((link) => link.source),
    };
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
