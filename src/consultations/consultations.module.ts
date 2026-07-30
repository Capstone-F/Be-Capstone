import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { SessionGuard } from '../auth/guards/session.guard';
import { ZegoModule } from '../modules/zego/zego.module';
import { ChatHistory } from './chat-history.entity';
import { ConsultationRequest } from './consultation-request.entity';
import { ConsultationsController } from './consultations.controller';
import { Feedback } from './feedback.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConsultationRequest, ChatHistory, Feedback]),
    AuthModule,
    ZegoModule,
  ],
  controllers: [ConsultationsController],
  providers: [SessionGuard],
  exports: [TypeOrmModule],
})
export class ConsultationsModule {}
