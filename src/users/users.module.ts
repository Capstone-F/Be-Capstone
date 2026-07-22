import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ClinicsModule } from '../clinics/clinics.module';
import { SurveyRecommendation } from '../recommendations/survey-recommendation.entity';
import { Label } from '../survey/label.entity';
import { SurveyModule } from '../survey/survey.module';
import { AdminCustomersController } from './admin-customers.controller';
import { CustomerAllergy } from './customer-allergy.entity';
import { Customer } from './customer.entity';
import { CustomerSkinTypeDetails } from './customer-skin-type-details.entity';
import { Expert } from './expert.entity';
import { SkinType } from './skin-type.entity';
import { User } from './user.entity';
import { Wallet } from './wallet.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Customer,
      CustomerSkinTypeDetails,
      Expert,
      SkinType,
      Wallet,
      CustomerAllergy,
      SurveyRecommendation,
      Label,
    ]),
    ClinicsModule,
    forwardRef(() => AuthModule),
    forwardRef(() => SurveyModule),
  ],
  controllers: [UsersController, AdminCustomersController],
  providers: [UsersService],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
