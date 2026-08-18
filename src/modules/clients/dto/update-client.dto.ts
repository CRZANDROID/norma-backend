import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateClientContactDto } from './create-client-contact.dto';
import { DeliveryConfigDto } from './delivery-config.dto';
import { FiscalDataDto } from './fiscal-data.dto';

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  /**
   * Si se envía, reemplaza el set completo de fuentes del cliente.
   * Omítelo para no tocar las vinculaciones.
   */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  sourceIds?: string[];

  /**
   * Si se envía, hace upsert de los datos fiscales 1:1.
   * Omítelo para no tocar fiscales.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => FiscalDataDto)
  fiscal?: FiscalDataDto;

  /**
   * Si se envía, reemplaza el set completo de contactos del cliente.
   * Omítelo para no tocar contactos. `[]` elimina todos.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateClientContactDto)
  contacts?: CreateClientContactDto[];

  /**
   * Si se envía, hace upsert de la config de entrega/semáforo.
   * Omítelo para no tocarla.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryConfigDto)
  delivery?: DeliveryConfigDto;
}
