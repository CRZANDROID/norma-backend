import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import {
  FindingStatus,
  ImpactLevel,
} from '../../../database/prisma-client';
import {
  FINDING_LOTES,
  type FindingLote,
} from '../lote.where';

export class ListFindingsQueryDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por id de fuente (cuid). Gana sobre sourceCode.',
  })
  @IsOptional()
  @IsString()
  sourceId?: string;

  @ApiPropertyOptional({
    example: 'dof',
    description: 'Filtrar por código de fuente (dof, diputados-gaceta, …)',
  })
  @IsOptional()
  @IsString()
  sourceCode?: string;

  @IsOptional()
  @IsString()
  documentId?: string;

  @IsOptional()
  @IsEnum(ImpactLevel)
  impact?: ImpactLevel;

  @IsOptional()
  @IsEnum(FindingStatus)
  status?: FindingStatus;

  @ApiPropertyOptional({
    description:
      'Filtra items por exclusión del próximo informe. No cambia counts.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (value === true || value === 'true' || value === '1') {
      return true;
    }
    if (value === false || value === 'false' || value === '0') {
      return false;
    }
    return value;
  })
  @IsBoolean()
  excluded?: boolean;

  @ApiPropertyOptional({
    enum: FINDING_LOTES,
    description:
      'Cubeta del próximo informe. incluidos = candidatos del PDF; excluidos = flag y no quemados; enviados = en un PDF sent. Gana sobre excluded. No recorta counts de color.',
  })
  @IsOptional()
  @IsIn(FINDING_LOTES)
  lote?: FindingLote;

  @ApiPropertyOptional({
    example: '2026-09-02',
    description:
      'Inicio del rango (día civil America/Mexico_City). Omitir con dateTo = lista completa.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateFrom debe ser YYYY-MM-DD',
  })
  dateFrom?: string;

  @ApiPropertyOptional({
    example: '2026-09-07',
    description: 'Fin del rango (día civil, inclusive).',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateTo debe ser YYYY-MM-DD',
  })
  dateTo?: string;

  @ApiPropertyOptional({ example: 1, description: 'Página 1-based. Default 1.' })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    example: 50,
    description: 'Tamaño de página (1–200). El front lo elige. Default 50.',
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
