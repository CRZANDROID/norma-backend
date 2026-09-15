import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  REPORT_API_STATUSES,
  type ReportApiStatus,
} from '../reports.constants';

export class ListReportsQueryDto {
  @ApiPropertyOptional({ description: 'Filtrar por cliente.' })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({
    enum: REPORT_API_STATUSES,
    description: 'draft | sent | discarded',
  })
  @IsOptional()
  @IsIn(REPORT_API_STATUSES)
  status?: ReportApiStatus;

  @ApiPropertyOptional({ example: 1, description: 'Página 1-based. Default 1.' })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    example: 50,
    description: 'Tamaño de página (1–200). Default 50.',
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
