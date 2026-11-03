import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsOptional, IsString } from 'class-validator';

/** Contactos activos del cliente que deben recibir este envío. Vacío = no enviar. */
export class SendReportDto {
  @ApiPropertyOptional({
    type: [String],
    description:
      'Ids de contactos activos con correo. Omitir o [] no envía y deja el informe en draft.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  contactIds?: string[];
}
