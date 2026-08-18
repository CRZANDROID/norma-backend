import {
  MexicanState,
  SourceCategory,
  SourceJurisdiction,
  SourcePlatform,
} from '../../../database/prisma-client';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ScheduleDto } from '../../../common/dto/schedule.dto';
import { IsSectionPaths } from './section-paths';

export class CreateSourceDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'code must be kebab-case ([a-z0-9-]+)',
  })
  code!: string;

  @IsEnum(SourceCategory)
  category!: SourceCategory;

  @IsEnum(SourcePlatform)
  platform!: SourcePlatform;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  url?: string;

  @IsOptional()
  @IsEnum(SourceJurisdiction)
  jurisdiction?: SourceJurisdiction;

  /** Obligatorio si jurisdiction = STATE. */
  @IsOptional()
  @IsEnum(MexicanState)
  stateCode?: MexicanState;

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
  @IsString()
  @MinLength(3)
  searchFocus?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  notes?: string;

  /** Clientes a vincular al crear la fuente (la edición de vínculos va en clientes). */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  clientIds?: string[];
}
