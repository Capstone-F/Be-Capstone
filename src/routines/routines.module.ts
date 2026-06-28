import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoutineCheckIn } from './routine-check-in.entity';
import { RoutineEndpointForecast } from './routine-endpoint-forecast.entity';
import { RoutineSideEffect } from './routine-side-effect.entity';
import { RoutineStepCompletion } from './routine-step-completion.entity';
import { RoutineStepDetails } from './routine-step-details.entity';
import { RoutineStepProtocol } from './routine-step-protocol.entity';
import { RoutineStep } from './routine-step.entity';
import { RoutineSupportHabit } from './routine-support-habit.entity';
import { Routine } from './routine.entity';
import { SupportHabit } from './support-habit.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Routine,
      RoutineStep,
      RoutineStepProtocol,
      RoutineStepDetails,
      RoutineCheckIn,
      RoutineStepCompletion,
      RoutineSideEffect,
      SupportHabit,
      RoutineSupportHabit,
      RoutineEndpointForecast,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class RoutinesModule {}
