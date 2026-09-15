import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateReportDto {
  @ApiProperty({
    description: 'Cliente del informe. Obligatorio: un PDF no mezcla tenants.',
  })
  @IsString()
  @MinLength(1)
  clientId!: string;

  @ApiPropertyOptional({
    example: '2026-09-14',
    description:
      'Inicio del rango (día civil America/Mexico_City). Omitir = sin piso.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateFrom debe ser YYYY-MM-DD',
  })
  dateFrom?: string;

  @ApiPropertyOptional({
    example: '2026-09-14',
    description: 'Fin del rango (día civil, inclusive). Omitir = sin techo.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateTo debe ser YYYY-MM-DD',
  })
  dateTo?: string;
}
