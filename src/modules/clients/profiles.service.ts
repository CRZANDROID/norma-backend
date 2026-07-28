import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityStatus, Prisma } from '../../database/prisma-client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { assertClientAccess } from './client-access.util';
import { ClientsService } from './clients.service';
import { CreateRegulatoryProfileDto } from './dto/create-regulatory-profile.dto';
import { ListProfilesQueryDto } from './dto/list-profiles.query.dto';
import { UpdateRegulatoryProfileDto } from './dto/update-regulatory-profile.dto';

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
  ) {}

  async findByClient(
    user: AuthUser,
    clientId: string,
    query: ListProfilesQueryDto,
  ) {
    await this.clientsService.ensureExists(clientId);
    assertClientAccess(user, clientId);

    const where: Prisma.RegulatoryProfileWhereInput = { clientId };
    if (query.status) {
      where.status = query.status;
    }

    return this.prisma.regulatoryProfile.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async create(
    user: AuthUser,
    clientId: string,
    dto: CreateRegulatoryProfileDto,
  ) {
    await this.clientsService.ensureExists(clientId);
    assertClientAccess(user, clientId);

    return this.prisma.regulatoryProfile.create({
      data: {
        clientId,
        name: dto.name,
        description: dto.description,
        keywords: dto.keywords ?? [],
        categories: dto.categories ?? [],
        products:
          dto.products === undefined
            ? Prisma.JsonNull
            : (dto.products as Prisma.InputJsonValue),
      },
    });
  }

  async findOne(user: AuthUser, id: string) {
    const profile = await this.getProfileOrThrow(id);
    assertClientAccess(user, profile.clientId);
    return profile;
  }

  async update(user: AuthUser, id: string, dto: UpdateRegulatoryProfileDto) {
    const profile = await this.getProfileOrThrow(id);
    assertClientAccess(user, profile.clientId);

    const data: Prisma.RegulatoryProfileUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.keywords !== undefined) data.keywords = dto.keywords;
    if (dto.categories !== undefined) data.categories = dto.categories;
    if (dto.products !== undefined) {
      data.products = dto.products as Prisma.InputJsonValue;
    }

    return this.prisma.regulatoryProfile.update({
      where: { id },
      data,
    });
  }

  async deactivate(id: string) {
    await this.getProfileOrThrow(id);

    return this.prisma.regulatoryProfile.update({
      where: { id },
      data: { status: EntityStatus.INACTIVE },
    });
  }

  async activate(id: string) {
    await this.getProfileOrThrow(id);

    return this.prisma.regulatoryProfile.update({
      where: { id },
      data: { status: EntityStatus.ACTIVE },
    });
  }

  private async getProfileOrThrow(id: string) {
    const profile = await this.prisma.regulatoryProfile.findUnique({
      where: { id },
    });

    if (!profile) {
      throw new NotFoundException('Regulatory profile not found');
    }

    return profile;
  }
}
