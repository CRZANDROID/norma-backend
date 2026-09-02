import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from '../modules/auth/auth.module';
import { AiModule } from '../modules/ai/ai.module';
import { StorageModule } from '../modules/storage/storage.module';
import { ArtifactStore } from './artifact-store';
import { CrawlProcessor } from './crawl.processor';
import { CrawlProducer } from './crawl.producer';
import { CrawlScheduler } from './crawl.scheduler';
import { DocumentClassifyService } from './document-classify.service';
import { DocumentJobsProcessor } from './document-jobs.processor';
import { DocumentJobsProducer } from './document-jobs.producer';
import { DocumentPipelineService } from './document-pipeline.service';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [ScheduleModule.forRoot(), AuthModule, StorageModule, AiModule],
  controllers: [JobsController],
  providers: [
    CrawlProducer,
    CrawlProcessor,
    CrawlScheduler,
    ArtifactStore,
    JobsService,
    DocumentPipelineService,
    DocumentClassifyService,
    DocumentJobsProducer,
    DocumentJobsProcessor,
  ],
  exports: [
    JobsService,
    DocumentJobsProducer,
    DocumentPipelineService,
    DocumentClassifyService,
  ],
})
export class JobsModule {}
