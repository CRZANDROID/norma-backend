import {
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

    return this.prisma.client.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(user: AuthUser, id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: { profiles: { orderBy: { name: 'asc' } } },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    assertClientAccess(user, client.id);
    return client;
  }

  async create(dto: CreateClientDto) {
    try {
      return await this.prisma.client.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          email: dto.email,
          phone: dto.phone,
        },
      });
    } catch (error) {
      this.rethrowUniqueConflict(error, 'Client slug already exists');
    }
  }

  async update(id: string, dto: UpdateClientDto) {
    await this.ensureExists(id);

    return this.prisma.client.update({
      where: { id },
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
      },
    });
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
