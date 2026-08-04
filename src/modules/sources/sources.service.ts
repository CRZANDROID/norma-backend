import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityStatus, Prisma } from '../../database/prisma-client';
import { PrismaService } from '../../database/prisma.service';
import { CreateSourceDto } from './dto/create-source.dto';
import { ListSourcesQueryDto } from './dto/list-sources.query.dto';
import { UpdateSourceDto } from './dto/update-source.dto';

const sourceWithClients = {
  clientSources: {
    include: {
      client: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.SourceInclude;

type SourceWithClients = Prisma.SourceGetPayload<{
  include: typeof sourceWithClients;
}>;

@Injectable()
export class SourcesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListSourcesQueryDto) {
    const where: Prisma.SourceWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.jurisdiction?.trim()) {
      where.jurisdiction = {
        equals: query.jurisdiction.trim(),
        mode: 'insensitive',
      };
    }

    if (query.clientId?.trim()) {
      where.clientSources = {
        some: { clientId: query.clientId.trim() },
      };
    }

    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
      ];
    }

    const sources = await this.prisma.source.findMany({
      where,
      include: sourceWithClients,
      orderBy: { name: 'asc' },
    });

    return sources.map((s) => this.shapeSource(s));
  }

  async findOne(id: string) {
    const source = await this.prisma.source.findUnique({
      where: { id },
      include: sourceWithClients,
    });
    if (!source) {
      throw new NotFoundException('Source not found');
    }
    return this.shapeSource(source);
  }

  async create(dto: CreateSourceDto) {
    const clientIds = dto.clientIds ?? [];
    await this.assertClientsExist(clientIds);

    try {
      const source = await this.prisma.source.create({
        data: {
          name: dto.name,
          code: dto.code,
          type: dto.type,
          url: dto.url,
          section: dto.section,
          jurisdiction: dto.jurisdiction,
          frequency: dto.frequency,
          keywordsGuide: dto.keywordsGuide ?? [],
          config:
            dto.config === undefined
              ? Prisma.JsonNull
              : (dto.config as Prisma.InputJsonValue),
          clientSources: clientIds.length
            ? {
                create: clientIds.map((clientId) => ({ clientId })),
              }
            : undefined,
        },
        include: sourceWithClients,
      });
      return this.shapeSource(source);
    } catch (error) {
      this.rethrowUniqueConflict(error, 'Source code already exists');
    }
  }

  async update(id: string, dto: UpdateSourceDto) {
    await this.ensureExists(id);

    const data: Prisma.SourceUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.url !== undefined) data.url = dto.url;
    if (dto.section !== undefined) data.section = dto.section;
    if (dto.jurisdiction !== undefined) data.jurisdiction = dto.jurisdiction;
    if (dto.frequency !== undefined) data.frequency = dto.frequency;
    if (dto.keywordsGuide !== undefined) data.keywordsGuide = dto.keywordsGuide;
    if (dto.config !== undefined) {
      data.config = dto.config as Prisma.InputJsonValue;
    }

    const source = await this.prisma.source.update({
      where: { id },
      data,
      include: sourceWithClients,
    });
    return this.shapeSource(source);
  }

  async deactivate(id: string) {
    await this.ensureExists(id);

    return this.prisma.source.update({
      where: { id },
      data: { status: EntityStatus.INACTIVE },
    });
  }

  async activate(id: string) {
    await this.ensureExists(id);

    return this.prisma.source.update({
      where: { id },
      data: { status: EntityStatus.ACTIVE },
    });
  }

  private async ensureExists(id: string) {
    const source = await this.prisma.source.findUnique({ where: { id } });
    if (!source) {
      throw new NotFoundException('Source not found');
    }
    return source;
  }

  private shapeSource(source: SourceWithClients) {
    const { clientSources, ...rest } = source;
    return {
      ...rest,
      clients: clientSources.map((link) => link.client),
    };
  }

  private async assertClientsExist(clientIds: string[]) {
    if (clientIds.length === 0) return;

    const found = await this.prisma.client.findMany({
      where: { id: { in: clientIds } },
      select: { id: true },
    });
    const foundIds = new Set(found.map((c) => c.id));
    const missing = clientIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Client(s) not found: ${missing.join(', ')}`,
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
