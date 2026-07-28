import { UserRole } from '../../../database/prisma-client';
import { IsEnum, IsString } from 'class-validator';

export class CreateMembershipDto {
  @IsString()
  clientId!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}
