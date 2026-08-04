import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityStatus, Prisma } from '../../database/prisma-client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { assertClientAccess } from './client-access.util';
import { ClientsService } from './clients.service';
import { CreateClientContactDto } from './dto/create-client-contact.dto';
import { ListContactsQueryDto } from './dto/list-contacts.query.dto';
import { UpdateClientContactDto } from './dto/update-client-contact.dto';

@Injectable()
export class ClientContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
  ) {}

  async findByClient(
    user: AuthUser,
    clientId: string,
    query: ListContactsQueryDto,
  ) {
    await this.clientsService.ensureExists(clientId);
    assertClientAccess(user, clientId);

    const where: Prisma.ClientContactWhereInput = { clientId };
    if (query.status) {
      where.status = query.status;
    }

    return this.prisma.clientContact.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async create(
    user: AuthUser,
    clientId: string,
    dto: CreateClientContactDto,
  ) {
    await this.clientsService.ensureExists(clientId);
    assertClientAccess(user, clientId);

    return this.prisma.clientContact.create({
      data: {
        clientId,
        name: dto.name.trim(),
        phone: dto.phone.trim(),
        email: dto.email?.trim(),
      },
    });
  }

  async findOne(user: AuthUser, id: string) {
    const contact = await this.getContactOrThrow(id);
    assertClientAccess(user, contact.clientId);
    return contact;
  }

  async update(user: AuthUser, id: string, dto: UpdateClientContactDto) {
    const contact = await this.getContactOrThrow(id);
    assertClientAccess(user, contact.clientId);

    const data: Prisma.ClientContactUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.phone !== undefined) data.phone = dto.phone.trim();
    if (dto.email !== undefined) data.email = dto.email.trim();

    return this.prisma.clientContact.update({
      where: { id },
      data,
    });
  }

  async deactivate(id: string) {
    await this.getContactOrThrow(id);

    return this.prisma.clientContact.update({
      where: { id },
      data: { status: EntityStatus.INACTIVE },
    });
  }

  async activate(id: string) {
    await this.getContactOrThrow(id);

    return this.prisma.clientContact.update({
      where: { id },
      data: { status: EntityStatus.ACTIVE },
    });
  }

  private async getContactOrThrow(id: string) {
    const contact = await this.prisma.clientContact.findUnique({
      where: { id },
    });

    if (!contact) {
      throw new NotFoundException('Client contact not found');
    }

    return contact;
  }
}
