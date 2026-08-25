import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { DocumentProcessingStatus } from '../../../database/prisma-client';

export class ListDocumentsQueryDto {
  @IsOptional()
  @IsString()
  sourceCode?: string;

  @IsOptional()
  @IsEnum(DocumentProcessingStatus)
  processingStatus?: DocumentProcessingStatus;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  pilotOnly?: boolean;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
