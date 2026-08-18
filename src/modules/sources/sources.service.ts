import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityStatus, Prisma } from '../../database/prisma-client';
import {
  resolveSchedule,
  shapeSchedule,
} from '../../common/dto/schedule.dto';
import { PrismaService } from '../../database/prisma.service';
import { CreateSourceDto } from './dto/create-source.dto';
import { ListSourcesQueryDto } from './dto/list-sources.query.dto';
import { normalizeSections } from './dto/section-paths';
import { UpdateSourceDto } from './dto/update-source.dto';
import { resolveSourceJurisdiction } from './source-jurisdiction.util';

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

    if (query.category) {
      where.category = query.category;
    }

    if (query.platform) {
      where.platform = query.platform;
    }

    if (query.jurisdiction) {
      where.jurisdiction = query.jurisdiction;
    }

    if (query.stateCode) {
      where.stateCode = query.stateCode;
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

    const { jurisdiction, stateCode } = resolveSourceJurisdiction({
      jurisdiction: dto.jurisdiction,
      stateCode: dto.stateCode,
      hasStateCode: dto.stateCode !== undefined,
    });
    const schedule = resolveSchedule(dto.schedule);

    try {
      const source = await this.prisma.source.create({
        data: {
          name: dto.name,
          code: dto.code,
          category: dto.category,
          platform: dto.platform,
          url: dto.url,
          jurisdiction,
          stateCode,
          scheduleTime: schedule.time,
          scheduleTimezone: schedule.timezone,
          scheduleWeekdays: schedule.weekdays,
          sections: normalizeSections(dto.sections ?? []) as Prisma.InputJsonValue,
          keywordsGuide: dto.keywordsGuide ?? [],
          searchFocus: dto.searchFocus ?? [],
          notes: dto.notes,
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
    const existing = await this.ensureExists(id);

    const data: Prisma.SourceUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.platform !== undefined) data.platform = dto.platform;
    if (dto.url !== undefined) data.url = dto.url;
    if (dto.sections !== undefined) {
      data.sections = normalizeSections(dto.sections) as Prisma.InputJsonValue;
    }
    if (dto.keywordsGuide !== undefined) data.keywordsGuide = dto.keywordsGuide;
    if (dto.searchFocus !== undefined) data.searchFocus = dto.searchFocus;
    if (dto.notes !== undefined) data.notes = dto.notes;

    const touchesJurisdiction =
      dto.jurisdiction !== undefined || dto.stateCode !== undefined;
    if (touchesJurisdiction) {
      const resolved = resolveSourceJurisdiction({
        jurisdiction: dto.jurisdiction,
        stateCode: dto.stateCode,
        hasStateCode: dto.stateCode !== undefined,
        existing: {
          jurisdiction: existing.jurisdiction,
          stateCode: existing.stateCode,
        },
      });
      data.jurisdiction = resolved.jurisdiction;
      data.stateCode = resolved.stateCode;
    }

    if (dto.schedule !== undefined) {
      const schedule = resolveSchedule(dto.schedule, {
        time: existing.scheduleTime,
        timezone: existing.scheduleTimezone,
        weekdays: existing.scheduleWeekdays,
      });
      data.scheduleTime = schedule.time;
      data.scheduleTimezone = schedule.timezone;
      data.scheduleWeekdays = schedule.weekdays;
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
    const {
      clientSources,
      sections,
      scheduleTime,
      scheduleTimezone,
      scheduleWeekdays,
      ...rest
    } = source;
    return {
      ...rest,
      sections: normalizeSections(sections),
      schedule: shapeSchedule({
        time: scheduleTime,
        timezone: scheduleTimezone,
        weekdays: scheduleWeekdays,
      }),
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
