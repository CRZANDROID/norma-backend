import { SourceType } from '../../../database/prisma-client';
import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
} from 'class-validator';

export class UpdateSourceDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsEnum(SourceType)
  type?: SourceType;

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
}
