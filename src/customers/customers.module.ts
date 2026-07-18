import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { CustomerSurvey } from '../survey/customer-survey.entity';
import { Label } from '../survey/label.entity';
import { LabelCategory } from '../survey/label-category.entity';
import { CustomerAllergy } from '../users/customer-allergy.entity';
import { Customer } from '../users/customer.entity';
import { CustomerSkinTypeDetails } from '../users/customer-skin-type-details.entity';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

import { AdminCustomersController } from './admin-customers.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      CustomerSkinTypeDetails,
      CustomerAllergy,
      CustomerSurvey,
      Label,
      LabelCategory,
    ]),
    AuthModule,
  ],
  controllers: [CustomersController, AdminCustomersController],
  providers: [CustomersService, SessionGuard, RolesGuard],
  exports: [CustomersService],
})
export class CustomersModule {}
