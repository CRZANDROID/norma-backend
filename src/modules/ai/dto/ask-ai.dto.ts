import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AskMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(2000)
  content!: string;
}

export class ProfileSeedDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  companyName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class AskAiDto {
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  question!: string;

  /** Si se envía, el catálogo se limita a ese cliente (con AuthZ de membership). */
  @IsOptional()
  @IsString()
  clientId?: string;

  /** Lo manda el front solo si ese formulario está abierto y se puede editar. */
  @IsOptional()
  @IsIn(['profile', 'source'])
  draftTarget?: 'profile' | 'source';

  @IsOptional()
  @ValidateNested()
  @Type(() => ProfileSeedDto)
  profileSeed?: ProfileSeedDto;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sourceUrl?: string;

  /** Burbujas ya mostradas, sin la pregunta nueva. Más de 15: se quedan las últimas. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AskMessageDto)
  messages?: AskMessageDto[];
}
