import {
  SourceCategory,
  SourcePlatform,
} from '../../../database/prisma-client';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MinLength,
} from 'class-validator';
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
  @IsString()
  frequency?: string;

  @IsOptional()
  @IsArray()
  @IsSectionPaths()
  sections?: string[][];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywordsGuide?: string[];

  /** Clientes a vincular al crear la fuente (la edición de vínculos va en clientes). */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  clientIds?: string[];
}
