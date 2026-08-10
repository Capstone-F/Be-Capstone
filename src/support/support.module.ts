import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { SupportMessage } from './support-message.entity';
import { SupportSession } from './support-session.entity';
import { SupportSessionsController } from './support-sessions.controller';
import { SupportService } from './support.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SupportSession, SupportMessage]),
    AuthModule,
  ],
  controllers: [SupportSessionsController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
