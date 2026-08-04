import { EntityStatus, SourceType } from '../../../database/prisma-client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ListSourcesQueryDto {
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;

  @IsOptional()
  @IsEnum(SourceType)
  type?: SourceType;

  @IsOptional()
  @IsString()
  jurisdiction?: string;

  /** Filtra fuentes vinculadas a este cliente. */
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  q?: string;
}
