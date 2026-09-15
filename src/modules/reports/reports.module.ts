import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FindingsModule } from '../findings/findings.module';
import { StorageModule } from '../storage/storage.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [AuthModule, FindingsModule, StorageModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
