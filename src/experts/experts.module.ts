import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ClinicsModule } from '../clinics/clinics.module';
import { Feedback } from '../consultations/feedback.entity';
import { Expert } from '../users/expert.entity';
import { User } from '../users/user.entity';
import { ClinicExpertsController } from './clinic-experts.controller';
import { ExpertsController } from './experts.controller';
import { ExpertsService } from './experts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Expert, User, Feedback]),
    forwardRef(() => AuthModule),
    forwardRef(() => ClinicsModule),
  ],
  controllers: [ExpertsController, ClinicExpertsController],
  providers: [ExpertsService],
  exports: [ExpertsService],
})
export class ExpertsModule {}
