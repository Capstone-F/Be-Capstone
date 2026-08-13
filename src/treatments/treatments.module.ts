import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { ConsultationRequest } from '../consultations/consultation-request.entity';
import { Ingredient } from '../ingredients/ingredient.entity';
import { ProductIngredient } from '../products/product-ingredient.entity';
import { ProductProtocol } from '../products/product-protocol.entity';
import { ProductVariant } from '../products/product-variant.entity';
import { RoutineStepDetails } from '../routines/routine-step-details.entity';
import { RoutineStepProtocol } from '../routines/routine-step-protocol.entity';
import { RoutineStep } from '../routines/routine-step.entity';
import { RoutineStepCompletion } from '../routines/routine-step-completion.entity';
import { Routine } from '../routines/routine.entity';
import { StockBatch } from '../stock/stock-batch.entity';
import { CustomerAllergy } from '../users/customer-allergy.entity';
import { Customer } from '../users/customer.entity';
import { Expert } from '../users/expert.entity';
import { WalletModule } from '../wallet/wallet.module';
import { FinanceModule } from '../finance/finance.module';
import { LockedIngredient } from './locked-ingredient.entity';
import { TreatmentAccess } from './treatment-access.entity';
import { TreatmentEvent } from './treatment-event.entity';
import { TreatmentPhaseIngredient } from './treatment-phase-ingredient.entity';
import { TreatmentPhaseProduct } from './treatment-phase-product.entity';
import { TreatmentPhase } from './treatment-phase.entity';
import { Treatment } from './treatment.entity';
import { ClinicTreatmentsController } from './clinic-treatments.controller';
import { TreatmentsController } from './treatments.controller';
import { TreatmentsService } from './treatments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Treatment,
      TreatmentPhase,
      TreatmentEvent,
      TreatmentAccess,
      LockedIngredient,
      TreatmentPhaseIngredient,
      TreatmentPhaseProduct,
      Expert,
      Customer,
      ConsultationRequest,
      Ingredient,
      ProductVariant,
      ProductIngredient,
      ProductProtocol,
      Routine,
      RoutineStep,
      RoutineStepDetails,
      RoutineStepProtocol,
      RoutineStepCompletion,
      CustomerAllergy,
      StockBatch,
    ]),
    AuthModule,
    WalletModule,
    FinanceModule,
  ],
  controllers: [TreatmentsController, ClinicTreatmentsController],
  providers: [TreatmentsService, SessionGuard, RolesGuard],
  exports: [TypeOrmModule, TreatmentsService],
})
export class TreatmentsModule {}
