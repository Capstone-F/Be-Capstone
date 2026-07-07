import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { SessionGuard } from '../auth/guards/session.guard';
import { ConsultationRequest } from '../consultations/consultation-request.entity';
import { Expert } from '../users/expert.entity';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { ExpertAvailability } from './expert-availability.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Expert, ExpertAvailability, ConsultationRequest]),
    AuthModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService, SessionGuard],
  exports: [BookingsService],
})
export class BookingsModule {}
