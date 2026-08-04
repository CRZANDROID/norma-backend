import {
  IsNotEmpty,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

/**
 * Bloque fiscal 1:1 del cliente.
 * RFC MX (12 moral / 13 física); CFDI y régimen fiscal como claves SAT (string).
 */
export class FiscalDataDto {
  @IsString()
  @MinLength(2)
  legalName!: string;

  @IsString()
  @Matches(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i, {
    message: 'rfc must be a valid Mexican RFC (12–13 chars)',
  })
  rfc!: string;

  @IsString()
  @Matches(/^\d{5}$/, { message: 'postalCode must be 5 digits' })
  postalCode!: string;

  /** Uso de CFDI (catálogo SAT), ej. G03 */
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  cfdi!: string;

  /** Tax regime (SAT catalog), e.g. 601 */
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  taxRegime!: string;
}
