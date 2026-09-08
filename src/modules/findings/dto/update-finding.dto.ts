import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ImpactLevel } from '../../../database/prisma-client';

export class UpdateFindingDto {
  @ApiPropertyOptional({ description: 'Título de la medida. Máx. 160.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional({
    description: 'Briefing en Markdown. No cambia status.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  justification?: string;

  @ApiPropertyOptional({
    enum: ImpactLevel,
    description:
      'Semáforo a mano (VCGA). GREEN limpia excludedFromNextReport porque no entra al informe.',
  })
  @IsOptional()
  @IsEnum(ImpactLevel)
  impact?: ImpactLevel;
}
