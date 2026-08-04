import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class DownloadQueryDto {
  /** Path relativo dentro del bucket (ej. clients/abc/file.pdf). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Matches(/^[a-zA-Z0-9._\-\/]+$/, {
    message: 'path solo admite letras, números, ., _, - y /',
  })
  path!: string;
}
