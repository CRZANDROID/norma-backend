import { IsOptional, IsString } from 'class-validator';

export class TriggerCrawlDto {
  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsString()
  sourceCode?: string;
}
