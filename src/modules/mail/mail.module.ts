import { Module } from '@nestjs/common';
import { TransactionalMailService } from './transactional-mail.service';

@Module({
  providers: [TransactionalMailService],
  exports: [TransactionalMailService],
})
export class MailModule {}
