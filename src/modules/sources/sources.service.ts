import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityStatus, Prisma } from '../../database/prisma-client';
import { PrismaService } from '../../database/prisma.service';
import { CreateSourceDto } from './dto/create-source.dto';
import { ListSourcesQueryDto } from './dto/list-sources.query.dto';
import { UpdateSourceDto } from './dto/update-source.dto';

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

    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
      ];
    }

    return this.prisma.source.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const source = await this.prisma.source.findUnique({ where: { id } });
    if (!source) {
      throw new NotFoundException('Source not found');
    }
    return source;
  }

  async create(dto: CreateSourceDto) {
    try {
      return await this.prisma.source.create({
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
        },
      });
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

    return this.prisma.source.update({
      where: { id },
      data,
    });
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
