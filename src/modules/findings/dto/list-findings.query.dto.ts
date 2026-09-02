import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  FindingStatus,
  ImpactLevel,
} from '../../../database/prisma-client';

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

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
