import { EntityStatus } from '../../../database/prisma-client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListProfilesQueryDto {
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;
}
