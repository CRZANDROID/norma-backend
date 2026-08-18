import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { assertClientAccess } from './client-access.util';
import { DeliveryConfigDto } from './dto/delivery-config.dto';
import { shapeDeliveryConfig, toDeliveryWriteData } from './delivery.util';

@Injectable()
export class ClientDeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  async findByClient(user: AuthUser, clientId: string) {
    await this.assertClient(user, clientId);
    const row = await this.prisma.clientDeliveryConfig.findUnique({
      where: { clientId },
    });
    if (!row) {
      throw new NotFoundException('Delivery config not found');
    }
    return shapeDeliveryConfig(row);
  }

  async upsert(user: AuthUser, clientId: string, dto: DeliveryConfigDto) {
    await this.assertClient(user, clientId);
    const existing = await this.prisma.clientDeliveryConfig.findUnique({
      where: { clientId },
    });

    const data = toDeliveryWriteData({
      emailEnabled: dto.emailEnabled,
      whatsappEnabled: dto.whatsappEnabled,
      schedule: dto.schedule,
      impactActions: dto.impactActions,
      fallback: existing
        ? {
            emailEnabled: existing.emailEnabled,
            whatsappEnabled: existing.whatsappEnabled,
            schedule: {
              time: existing.deliveryTime,
              timezone: existing.deliveryTimezone,
              weekdays: existing.deliveryWeekdays,
            },
            impactActions: existing.impactActions,
          }
        : undefined,
    });

    const row = await this.prisma.clientDeliveryConfig.upsert({
      where: { clientId },
      create: { clientId, ...data },
      update: data,
    });
    return shapeDeliveryConfig(row);
  }

  private async assertClient(user: AuthUser, clientId: string) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    });
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    assertClientAccess(user, clientId);
  }
}
