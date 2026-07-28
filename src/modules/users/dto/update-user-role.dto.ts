import { UserRole } from '../../../database/prisma-client';
import { IsEnum } from 'class-validator';

export class UpdateUserRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;
}
