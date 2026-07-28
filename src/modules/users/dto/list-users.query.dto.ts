import { EntityStatus } from '../../../database/prisma-client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ListUsersQueryDto {
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;

  @IsOptional()
  @IsString()
  q?: string;
}
