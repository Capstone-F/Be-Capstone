import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { ConsultationRequest } from '../consultations/consultation-request.entity';
import { CustomerSurvey } from '../survey/customer-survey.entity';
import { Label } from '../survey/label.entity';
import { LabelCategory } from '../survey/label-category.entity';
import { Treatment } from '../treatments/treatment.entity';
import { CustomerAllergy } from '../users/customer-allergy.entity';
import { Customer } from '../users/customer.entity';
import { CustomerSkinTypeDetails } from '../users/customer-skin-type-details.entity';
import { Expert } from '../users/expert.entity';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      CustomerSkinTypeDetails,
      CustomerAllergy,
      CustomerSurvey,
      Label,
      LabelCategory,
      Expert,
      ConsultationRequest,
      Treatment,
    ]),
    AuthModule,
  ],
  controllers: [CustomersController],
  providers: [CustomersService, SessionGuard, RolesGuard],
  exports: [CustomersService],
})
export class CustomersModule {}
