import {
  MexicanState,
  SourceCategory,
  SourceJurisdiction,
  SourcePlatform,
} from '../../../database/prisma-client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ScheduleDto } from '../../../common/dto/schedule.dto';
import { IsSectionPaths } from './section-paths';

export class UpdateSourceDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsEnum(SourceCategory)
  category?: SourceCategory;

  @IsOptional()
  @IsEnum(SourcePlatform)
  platform?: SourcePlatform;

  /** `null` limpia la URL. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl({ require_protocol: true })
  url?: string | null;

  @IsOptional()
  @IsEnum(SourceJurisdiction)
  jurisdiction?: SourceJurisdiction;

  /** `null` limpia el estado (solo válido si jurisdiction queda FEDERAL). */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(MexicanState)
  stateCode?: MexicanState | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScheduleDto)
  schedule?: ScheduleDto;

  @IsOptional()
  @IsArray()
  @IsSectionPaths()
  sections?: string[][];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywordsGuide?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  searchFocus?: string[];

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(3)
  notes?: string | null;
}
