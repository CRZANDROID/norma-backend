import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { ScheduleDto } from '../../../common/dto/schedule.dto';
import { ImpactActionDto } from './impact-action.dto';

/** Bloque de entrega + semáforo (create/PATCH client o PATCH /clients/:id/delivery). */
export class DeliveryConfigDto {
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  whatsappEnabled?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScheduleDto)
  schedule?: ScheduleDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImpactActionDto)
  impactActions?: ImpactActionDto[];
}
