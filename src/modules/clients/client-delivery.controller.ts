import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '../../database/prisma-client';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClientDeliveryService } from './client-delivery.service';
import { DeliveryConfigDto } from './dto/delivery-config.dto';

@ApiTags('delivery')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse()
@Controller('clients')
@UseGuards(JwtAuthGuard)
export class ClientDeliveryController {
  constructor(private readonly deliveryService: ClientDeliveryService) {}

  @Get(':clientId/delivery')
  @ApiOperation({
    summary: 'Config de entrega y semáforo del cliente (canales + acciones)',
  })
  findByClient(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
  ) {
    return this.deliveryService.findByClient(user, clientId);
  }

  @Patch(':clientId/delivery')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Actualizar canales, disparador de entrega y acciones por nivel (no envía)',
  })
  @ApiForbiddenResponse()
  upsert(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Body() dto: DeliveryConfigDto,
  ) {
    return this.deliveryService.upsert(user, clientId, dto);
  }
}
