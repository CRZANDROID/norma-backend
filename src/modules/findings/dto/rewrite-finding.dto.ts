import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RewriteFindingDto {
  @ApiProperty({
    example: 'Acorta el periodo y deja solo lo que aplica a etiquetado.',
    description: 'Indicación de VCGA. OpenAI no ve el catálogo.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  prompt!: string;
}
