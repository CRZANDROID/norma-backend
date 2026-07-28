import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityStatus, Prisma, UserRole } from '../../database/prisma-client';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users.query.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';

const userWithMemberships = {
  memberships: {
    include: { client: true },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.UserInclude;

type UserWithMemberships = Prisma.UserGetPayload<{
  include: typeof userWithMemberships;
}>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async create(dto: CreateUserDto) {
    const authUser = await this.authService.createUser({
      email: dto.email,
      name: dto.name,
      password: dto.password,
      role: dto.role,
    });

    return this.findOne(authUser.id);
  }

  async findAll(query: ListUsersQueryDto) {
    const where: Prisma.UserWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      include: userWithMemberships,
      orderBy: { email: 'asc' },
    });

    return users.map((user) => this.toAdminUser(user));
  }

  async findOne(id: string) {
    const user = await this.getUserOrThrow(id);
    return this.toAdminUser(user);
  }

  async updateRole(id: string, role: UserRole) {
    await this.getUserOrThrow(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: { role },
      include: userWithMemberships,
    });

    return this.toAdminUser(user);
  }

  async deactivate(id: string) {
    await this.getUserOrThrow(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: { status: EntityStatus.INACTIVE },
      include: userWithMemberships,
    });

    return this.toAdminUser(user);
  }

  async activate(id: string) {
    await this.getUserOrThrow(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: { status: EntityStatus.ACTIVE },
      include: userWithMemberships,
    });

    return this.toAdminUser(user);
  }

  async createMembership(userId: string, dto: CreateMembershipDto) {
    await this.getUserOrThrow(userId);

    const client = await this.prisma.client.findUnique({
      where: { id: dto.clientId },
    });
    if (!client) {
      throw new NotFoundException('Client not found');
    }

    try {
      const membership = await this.prisma.clientMembership.create({
        data: {
          userId,
          clientId: dto.clientId,
          role: dto.role,
        },
        include: { client: true },
      });

      return this.toMembership(membership);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Membership already exists for this user and client',
        );
      }
      throw error;
    }
  }

  async updateMembership(id: string, dto: UpdateMembershipDto) {
    const existing = await this.prisma.clientMembership.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Membership not found');
    }

    const membership = await this.prisma.clientMembership.update({
      where: { id },
      data: {
        role: dto.role,
        status: dto.status,
      },
      include: { client: true },
    });

    return this.toMembership(membership);
  }

  private async getUserOrThrow(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: userWithMemberships,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private toAdminUser(user: UserWithMemberships) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      memberships: user.memberships.map((m) => this.toMembership(m)),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private toMembership(
    membership: Prisma.ClientMembershipGetPayload<{
      include: { client: true };
    }>,
  ) {
    return {
      id: membership.id,
      clientId: membership.clientId,
      clientName: membership.client.name,
      clientSlug: membership.client.slug,
      role: membership.role,
      status: membership.status,
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt,
    };
  }
}
