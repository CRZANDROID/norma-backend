import {
  SourceCategory,
  SourcePlatform,
} from '../../../database/prisma-client';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
  ValidateIf,
} from 'class-validator';
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
  @IsString()
  frequency?: string | null;

  @IsOptional()
  @IsArray()
  @IsSectionPaths()
  sections?: string[][];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywordsGuide?: string[];
}
