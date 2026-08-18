import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { JobRunStatus } from '../../database/prisma-client';

export class ListJobRunsQueryDto {
  @IsOptional()
  @IsString()
  sourceCode?: string;

  @IsOptional()
  @IsEnum(JobRunStatus)
  status?: JobRunStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
