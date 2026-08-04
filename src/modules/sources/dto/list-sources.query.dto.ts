import {
  EntityStatus,
  SourceCategory,
  SourcePlatform,
} from '../../../database/prisma-client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ListSourcesQueryDto {
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;

  @IsOptional()
  @IsEnum(SourceCategory)
  category?: SourceCategory;

  @IsOptional()
  @IsEnum(SourcePlatform)
  platform?: SourcePlatform;

  /** Filtra fuentes vinculadas a este cliente. */
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  q?: string;
}
