import { BadRequestException } from '@nestjs/common';
import { ImpactLevel, Prisma } from '../../database/prisma-client';
import {
  resolveSchedule,
  shapeSchedule,
  type ScheduleDto,
  type ScheduleShape,
} from '../../common/dto/schedule.dto';
import { DEFAULT_IMPACT_ACTIONS } from './delivery.defaults';
import type { ImpactActionDto } from './dto/impact-action.dto';

const ALL_LEVELS: ImpactLevel[] = [
  ImpactLevel.GREEN,
  ImpactLevel.YELLOW,
  ImpactLevel.ORANGE,
  ImpactLevel.RED,
];

export type DeliveryRow = {
  id: string;
  clientId: string;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  deliveryTime: string;
  deliveryTimezone: string;
  deliveryWeekdays: number[];
  impactActions: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

export function parseImpactActions(
  value: Prisma.JsonValue | ImpactActionDto[] | undefined,
): ImpactActionDto[] | undefined {
  if (!value || !Array.isArray(value)) {
    return undefined;
  }
  return value as ImpactActionDto[];
}

export function normalizeImpactActions(
  actions?: ImpactActionDto[],
): ImpactActionDto[] {
  const source = actions?.length ? actions : DEFAULT_IMPACT_ACTIONS;
  if (source.length !== 4) {
    throw new BadRequestException(
      'impactActions must include exactly 4 levels (GREEN, YELLOW, ORANGE, RED)',
    );
  }

  const seen = new Set<ImpactLevel>();
  for (const action of source) {
    if (seen.has(action.impact)) {
      throw new BadRequestException(
        `Duplicate impact action for ${action.impact}`,
      );
    }
    seen.add(action.impact);
  }

  for (const level of ALL_LEVELS) {
    if (!seen.has(level)) {
      throw new BadRequestException(`Missing impact action for ${level}`);
    }
  }

  return ALL_LEVELS.map((level) => {
    const action = source.find((a) => a.impact === level)!;
    const fallback = DEFAULT_IMPACT_ACTIONS.find((a) => a.impact === level)!;
    return {
      ...action,
      suggestedAction: action.suggestedAction?.trim() || fallback.suggestedAction,
    };
  });
}

export function shapeDeliveryConfig(row: DeliveryRow) {
  return {
    id: row.id,
    clientId: row.clientId,
    emailEnabled: row.emailEnabled,
    whatsappEnabled: row.whatsappEnabled,
    schedule: shapeSchedule({
      time: row.deliveryTime,
      timezone: row.deliveryTimezone,
      weekdays: row.deliveryWeekdays,
    }),
    impactActions: row.impactActions,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toDeliveryWriteData(input: {
  emailEnabled?: boolean;
  whatsappEnabled?: boolean;
  schedule?: ScheduleDto;
  impactActions?: ImpactActionDto[];
  fallback?: {
    emailEnabled: boolean;
    whatsappEnabled: boolean;
    schedule: ScheduleShape;
    impactActions?: Prisma.JsonValue;
  };
}) {
  const fallback = input.fallback ?? {
    emailEnabled: true,
    whatsappEnabled: false,
    schedule: resolveSchedule(),
    impactActions: DEFAULT_IMPACT_ACTIONS,
  };

  const schedule = resolveSchedule(input.schedule, fallback.schedule);
  const impactActions = normalizeImpactActions(
    input.impactActions ?? parseImpactActions(fallback.impactActions),
  );

  return {
    emailEnabled: input.emailEnabled ?? fallback.emailEnabled,
    whatsappEnabled: input.whatsappEnabled ?? fallback.whatsappEnabled,
    deliveryTime: schedule.time,
    deliveryTimezone: schedule.timezone,
    deliveryWeekdays: schedule.weekdays,
    impactActions: impactActions as unknown as Prisma.InputJsonValue,
  };
}
