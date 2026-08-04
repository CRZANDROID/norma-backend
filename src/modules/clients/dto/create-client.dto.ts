import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateClientContactDto } from './create-client-contact.dto';
import { FiscalDataDto } from './fiscal-data.dto';

export class CreateClientDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must be kebab-case ([a-z0-9-]+)',
  })
  slug!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  /** IDs de fuentes a vincular al crear el cliente. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  sourceIds?: string[];

  /** Datos fiscales 1:1 (opcional al crear). */
  @IsOptional()
  @ValidateNested()
  @Type(() => FiscalDataDto)
  fiscal?: FiscalDataDto;

  /** Contactos directos a crear junto con el cliente. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateClientContactDto)
  contacts?: CreateClientContactDto[];
}
