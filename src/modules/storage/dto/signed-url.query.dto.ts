import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SignedUrlQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Matches(/^[a-zA-Z0-9._\-\/]+$/, {
    message: 'path solo admite letras, números, ., _, - y /',
  })
  path!: string;

  /** Segundos de vigencia (default 3600, máx 86400). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(86400)
  expiresIn?: number;
}
