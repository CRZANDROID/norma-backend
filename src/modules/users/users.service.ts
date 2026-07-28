import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export type UserListQuery = {
  status?: EntityStatus;
  q?: string;
};

const membershipInclude = {
  memberships: {
    include: { client: true },
    orderBy: { createdAt: 'asc' as const },
  },
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: UserListQuery) {
    const where: Prisma.UserWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      include: membershipInclude,
      orderBy: { createdAt: 'desc' },
    });

    return users.map((user) => this.toResponse(user));
  }

  async getById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: membershipInclude,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.toResponse(user);
  }

  private toResponse(
    user: Prisma.UserGetPayload<{ include: typeof membershipInclude }>,
  ) {
    return {
      id: user.id,
      authUserId: user.authUserId,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      memberships: user.memberships.map((m) => ({
        id: m.id,
        clientId: m.clientId,
        clientName: m.client.name,
        clientSlug: m.client.slug,
        role: m.role,
        status: m.status,
      })),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}
