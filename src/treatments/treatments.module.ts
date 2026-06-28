import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LockedIngredient } from './locked-ingredient.entity';
import { TreatmentAccess } from './treatment-access.entity';
import { TreatmentEvent } from './treatment-event.entity';
import { TreatmentPhase } from './treatment-phase.entity';
import { Treatment } from './treatment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Treatment,
      TreatmentPhase,
      TreatmentEvent,
      TreatmentAccess,
      LockedIngredient,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class TreatmentsModule {}
