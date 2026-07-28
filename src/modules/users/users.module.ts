import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MembershipsController } from './memberships.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule],
  controllers: [UsersController, MembershipsController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
