import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { OrderItem } from '../commerce/order-item.entity';
import { Order } from '../commerce/order.entity';
import { LlmModule } from '../llm/llm.module';
import { Customer } from '../users/customer.entity';
import { RoutineCheckIn } from './routine-check-in.entity';
import { RoutineEndpointForecast } from './routine-endpoint-forecast.entity';
import { RoutineGeneratorService } from './routine-generator.service';
import { RoutineSideEffect } from './routine-side-effect.entity';
import { RoutineStepCompletion } from './routine-step-completion.entity';
import { RoutineStepDetails } from './routine-step-details.entity';
import { RoutineStepProtocol } from './routine-step-protocol.entity';
import { RoutineStep } from './routine-step.entity';
import { RoutineSupportHabit } from './routine-support-habit.entity';
import { Routine } from './routine.entity';
import { RoutinesController } from './routines.controller';
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
      Order,
      OrderItem,
      Customer,
    ]),
    LlmModule,
    AuthModule,
  ],
  controllers: [RoutinesController],
  providers: [RoutineGeneratorService, SessionGuard, RolesGuard],
  exports: [TypeOrmModule, RoutineGeneratorService],
})
export class RoutinesModule {}
