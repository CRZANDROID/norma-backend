import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UploadQueryDto {
  /** Prefijo/carpeta dentro del bucket (sin leading slash). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/^[a-zA-Z0-9._\-\/]*$/, {
    message: 'folder solo admite letras, números, ., _, - y /',
  })
  folder?: string;

  /** clientId opcional para agrupar paths (prep. documentos por cliente). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientId?: string;
}
