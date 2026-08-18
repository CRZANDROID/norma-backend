import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ImpactLevel } from '../../../database/prisma-client';

export class ImpactActionDto {
  @IsEnum(ImpactLevel)
  impact!: ImpactLevel;

  @IsBoolean()
  notifyInbox!: boolean;

  @IsBoolean()
  sendEmail!: boolean;

  @IsBoolean()
  sendWhatsapp!: boolean;

  @IsBoolean()
  requireHumanApproval!: boolean;

  /** Texto de negocio (matriz VCGA): registrar, seguir, elaborar nota, alertar. */
  @IsOptional()
  @IsString()
  @MinLength(3)
  suggestedAction?: string;
}
