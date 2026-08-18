import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClientContactsController } from './client-contacts.controller';
import { ClientContactsService } from './client-contacts.service';
import { ClientDeliveryController } from './client-delivery.controller';
import { ClientDeliveryService } from './client-delivery.service';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

@Module({
  imports: [AuthModule],
  controllers: [
    ClientDeliveryController,
    ClientsController,
    ProfilesController,
    ClientContactsController,
  ],
  providers: [
    ClientsService,
    ProfilesService,
    ClientContactsService,
    ClientDeliveryService,
  ],
  exports: [ClientsService],
})
export class ClientsModule {}
