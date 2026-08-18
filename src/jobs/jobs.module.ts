import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from '../modules/auth/auth.module';
import { StorageModule } from '../modules/storage/storage.module';
import { ArtifactStore } from './artifact-store';
import { CrawlProcessor } from './crawl.processor';
import { CrawlProducer } from './crawl.producer';
import { CrawlScheduler } from './crawl.scheduler';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [ScheduleModule.forRoot(), AuthModule, StorageModule],
  controllers: [JobsController],
  providers: [
    CrawlProducer,
    CrawlProcessor,
    CrawlScheduler,
    ArtifactStore,
    JobsService,
  ],
  exports: [JobsService],
})
export class JobsModule {}
