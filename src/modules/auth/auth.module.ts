import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RolesGuard } from './roles.guard';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import { SupabaseService } from './supabase.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SupabaseService, SupabaseAuthGuard, RolesGuard],
  exports: [AuthService, SupabaseService, SupabaseAuthGuard, RolesGuard],
})
export class AuthModule {}
