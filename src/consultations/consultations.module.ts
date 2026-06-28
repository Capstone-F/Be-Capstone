import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatHistory } from './chat-history.entity';
import { ConsultationRequest } from './consultation-request.entity';
import { Feedback } from './feedback.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConsultationRequest, ChatHistory, Feedback]),
  ],
  exports: [TypeOrmModule],
})
export class ConsultationsModule {}
