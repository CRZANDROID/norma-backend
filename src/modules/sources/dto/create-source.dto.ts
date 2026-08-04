import { SourceType } from '../../../database/prisma-client';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateSourceDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'code must be kebab-case ([a-z0-9-]+)',
  })
  code!: string;

  @IsEnum(SourceType)
  type!: SourceType;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  url?: string;

  @IsOptional()
  @IsString()
  section?: string;

  @IsOptional()
  @IsString()
  jurisdiction?: string;

  @IsOptional()
  @IsString()
  frequency?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywordsGuide?: string[];

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  /** Clientes a vincular al crear la fuente (la edición de vínculos va en clientes). */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  clientIds?: string[];
}
