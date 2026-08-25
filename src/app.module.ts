import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { PrismaModule } from './database/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClientsModule } from './modules/clients/clients.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { SourcesModule } from './modules/sources/sources.module';
import { UsersModule } from './modules/users/users.module';
import { StorageModule } from './modules/storage/storage.module';
import { AiModule } from './modules/ai/ai.module';
import { JobsModule } from './jobs/jobs.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { readProjectEnvFile } from './config/project-env';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      // internalConfig gana a process.env vacío (p. ej. OPENAI_API_KEY del IDE).
      load: [readProjectEnvFile],
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    ClientsModule,
    AlertsModule,
    SourcesModule,
    UsersModule,
    StorageModule,
    AiModule,
    JobsModule,
    DocumentsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
  ],
})
export class AppModule {}
