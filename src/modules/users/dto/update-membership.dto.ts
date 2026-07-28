import { EntityStatus, UserRole } from '../../../database/prisma-client';
import { IsEnum, IsOptional } from 'class-validator';

export class UpdateMembershipDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;
}
