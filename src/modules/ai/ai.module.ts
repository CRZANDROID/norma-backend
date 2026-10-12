import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { CatalogContextService } from './catalog-context.service';
import { OpenAiClientService } from './openai-client.service';
import { ProfileWebSearchService } from './profile-web-search.service';

@Module({
  imports: [AuthModule],
  controllers: [AiController],
  providers: [
    AiService,
    CatalogContextService,
    OpenAiClientService,
    ProfileWebSearchService,
  ],
  exports: [AiService, OpenAiClientService],
})
export class AiModule {}
