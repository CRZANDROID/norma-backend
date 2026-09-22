import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class TriggerSourcePipelineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceCode?: string;

  @ApiPropertyOptional({
    example: '2026-09-22',
    description:
      'Día civil America/Mexico_City (YYYY-MM-DD). Si se omite, es hoy en esa zona.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date debe ser YYYY-MM-DD',
  })
  date?: string;
}
