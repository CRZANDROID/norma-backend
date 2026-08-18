import {
  EntityStatus,
  MexicanState,
  SourceCategory,
  SourceJurisdiction,
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

  @IsOptional()
  @IsEnum(SourceJurisdiction)
  jurisdiction?: SourceJurisdiction;

  @IsOptional()
  @IsEnum(MexicanState)
  stateCode?: MexicanState;

  /** Filtra fuentes vinculadas a este cliente. */
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  q?: string;
}
