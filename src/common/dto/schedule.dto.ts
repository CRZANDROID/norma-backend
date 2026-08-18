import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';

/** Disparador: hora HH:mm, zona IANA, días ISO (1=lunes … 7=domingo). */
export class ScheduleDto {
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'time must be HH:mm (00:00–23:59)',
  })
  time!: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  timezone?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays?: number[];
}

export const DEFAULT_SCHEDULE: {
  time: string;
  timezone: string;
  weekdays: number[];
} = {
  time: '07:00',
  timezone: 'America/Mexico_City',
  weekdays: [1, 2, 3, 4, 5],
};

export type ScheduleShape = {
  time: string;
  timezone: string;
  weekdays: number[];
};

export function resolveSchedule(
  input?: ScheduleDto,
  fallback: ScheduleShape = DEFAULT_SCHEDULE,
): ScheduleShape {
  const weekdays = input?.weekdays ?? fallback.weekdays;
  return {
    time: input?.time ?? fallback.time,
    timezone: input?.timezone?.trim() || fallback.timezone,
    weekdays: [...weekdays].sort((a, b) => a - b),
  };
}

export function shapeSchedule(row: {
  time: string;
  timezone: string;
  weekdays: number[];
}): ScheduleShape {
  return {
    time: row.time,
    timezone: row.timezone,
    weekdays: row.weekdays,
  };
}
