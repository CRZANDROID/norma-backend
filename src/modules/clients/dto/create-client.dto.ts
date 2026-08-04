import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

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
}
