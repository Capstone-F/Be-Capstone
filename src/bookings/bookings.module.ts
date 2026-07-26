import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { ConsultationRequest } from '../consultations/consultation-request.entity';
import { Feedback } from '../consultations/feedback.entity';
import { Treatment } from '../treatments/treatment.entity';
import { Customer } from '../users/customer.entity';
import { Expert } from '../users/expert.entity';
import { WalletModule } from '../wallet/wallet.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { ExpertAvailability } from './expert-availability.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Expert,
      ExpertAvailability,
      ConsultationRequest,
      Customer,
      Feedback,
      Treatment,
    ]),
    AuthModule,
    WalletModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService, SessionGuard, RolesGuard],
  exports: [BookingsService],
})
export class BookingsModule {}
