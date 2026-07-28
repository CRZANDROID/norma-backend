import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

@Module({
  imports: [AuthModule],
  controllers: [ClientsController, ProfilesController],
  providers: [ClientsService, ProfilesService],
  exports: [ClientsService],
})
export class ClientsModule {}
