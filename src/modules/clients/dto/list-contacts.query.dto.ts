import { IsEnum, IsOptional } from 'class-validator';
import { EntityStatus } from '../../../database/prisma-client';

export class ListContactsQueryDto {
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;
}
