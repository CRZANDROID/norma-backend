import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AskAiDto {
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  question!: string;

  /** Si se envía, el catálogo se limita a ese cliente (con AuthZ de membership). */
  @IsOptional()
  @IsString()
  clientId?: string;
}
