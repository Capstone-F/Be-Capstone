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
import { FinanceModule } from '../finance/finance.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { ClinicBookingsController } from './clinic-bookings.controller';
import { ExpertAvailabilityController } from './expert-availability.controller';
import { ExpertAvailability } from './expert-availability.entity';
import { ExpertAvailabilityService } from './expert-availability.service';

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
    FinanceModule,
  ],
  controllers: [
    BookingsController,
    ClinicBookingsController,
    ExpertAvailabilityController,
  ],
  providers: [
    BookingsService,
    ExpertAvailabilityService,
    SessionGuard,
    RolesGuard,
  ],
  exports: [BookingsService, ExpertAvailabilityService],
})
export class BookingsModule {}
