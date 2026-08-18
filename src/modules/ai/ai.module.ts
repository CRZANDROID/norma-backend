import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { CatalogContextService } from './catalog-context.service';

@Module({
  imports: [AuthModule],
  controllers: [AiController],
  providers: [AiService, CatalogContextService],
  exports: [AiService],
})
export class AiModule {}
