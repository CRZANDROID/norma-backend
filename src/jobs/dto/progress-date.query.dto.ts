import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

export class ProgressDateQueryDto {
  @ApiPropertyOptional({
    example: '2026-08-25',
    description:
      'Día civil America/Mexico_City (YYYY-MM-DD). Si se omite, es hoy en esa zona.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date debe ser YYYY-MM-DD',
  })
  date?: string;
}
