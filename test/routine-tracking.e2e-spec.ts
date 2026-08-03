/**
 * Routine tracking integration: today → complete/skip → check-in → history/missed.
 * Uses real TypeORM + Postgres (synchronize dropSchema).
 */
process.env.DATABASE_URL ??=
  'postgresql://admin:admin@localhost:5432/be-capstone';
process.env.KEYCLOAK_PUBLIC_URL ??= 'http://localhost:8080';
process.env.SESSION_SECRET ??= 'e2e-test-secret';
process.env.FRONTEND_URL ??= 'http://localhost:5173';

import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Role } from '../src/auth/roles.enum';
import { Order } from '../src/commerce/order.entity';
import { ConfigModule } from '../src/config/config.module';
import {
  CheckInMood,
  DayHistoryStatus,
  EmptyRoutineReason,
  RoutinePeriod,
  RoutineStatus,
  RoutineType,
  SessionState,
  SideEffectType,
  SkipReason,
  StepSessionStatus,
} from '../src/routines/enums';
import { RoutineCheckIn } from '../src/routines/routine-check-in.entity';
import { RoutineSideEffect } from '../src/routines/routine-side-effect.entity';
import { RoutineStepCompletion } from '../src/routines/routine-step-completion.entity';
import { RoutineStep } from '../src/routines/routine-step.entity';
import { RoutineTrackingService } from '../src/routines/routine-tracking.service';
import { getVnToday, shiftDate } from '../src/routines/routine-tracking.rules';
import { Routine } from '../src/routines/routine.entity';
import { Customer } from '../src/users/customer.entity';
import { Gender } from '../src/users/gender.enum';
import { User } from '../src/users/user.entity';
import { e2eTypeOrmConfig } from './e2e-typeorm.config';

describe('Routine tracking (e2e)', () => {
  let moduleFixture: TestingModule;
  let dataSource: DataSource;
  let tracking: RoutineTrackingService;

  jest.setTimeout(60_000);

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule,
        TypeOrmModule.forRoot(e2eTypeOrmConfig),
        TypeOrmModule.forFeature([
          User,
          Customer,
          Routine,
          RoutineStep,
          RoutineStepCompletion,
          RoutineCheckIn,
          RoutineSideEffect,
          Order,
        ]),
      ],
      providers: [RoutineTrackingService],
    }).compile();

    dataSource = moduleFixture.get(DataSource);
    tracking = moduleFixture.get(RoutineTrackingService);
  });

  afterAll(async () => {
    if (moduleFixture) {
      await moduleFixture.close();
    }
  });

  async function seedRoutine(opts?: { createdAt?: Date }) {
    const suffix = Math.random().toString(36).slice(2, 8);
    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        keycloakSub: `track-${suffix}`,
        email: `track-${suffix}@example.com`,
        name: 'Track Customer',
        provider: 'keycloak',
        roles: [Role.Customer],
        isActive: true,
      }),
    );
    const customer = await dataSource.getRepository(Customer).save(
      dataSource.getRepository(Customer).create({
        userId: user.id,
        gender: Gender.FEMALE,
        dateOfBirth: new Date('1995-01-01'),
      }),
    );

    const routine = await dataSource.getRepository(Routine).save(
      dataSource.getRepository(Routine).create({
        customerId: customer.id,
        type: RoutineType.AI_RECOMMENDED,
        status: RoutineStatus.ACTIVE,
        title: 'Tracking routine',
        description: null,
        treatmentPhaseId: null,
        createdByExpertId: null,
        sourceOrderId: null,
        customerSurveyId: null,
        surveyRecommendationId: null,
        createdAt: opts?.createdAt,
      }),
    );

    if (opts?.createdAt) {
      await dataSource
        .getRepository(Routine)
        .update(routine.id, { createdAt: opts.createdAt });
      routine.createdAt = opts.createdAt;
    }

    const stepRepo = dataSource.getRepository(RoutineStep);
    const steps = await stepRepo.save([
      stepRepo.create({
        routineId: routine.id,
        name: 'Cleanser',
        period: RoutinePeriod.MORNING,
        stepOrder: 1,
        instructions: 'Wash',
        waitMinutes: 0,
        dosageText: '1 pump',
      }),
      stepRepo.create({
        routineId: routine.id,
        name: 'Toner',
        period: RoutinePeriod.MORNING,
        stepOrder: 2,
        instructions: 'Tone',
        waitMinutes: 1,
        dosageText: '2 drops',
      }),
      stepRepo.create({
        routineId: routine.id,
        name: 'Serum',
        period: RoutinePeriod.EVENING,
        stepOrder: 1,
        instructions: 'Night',
        waitMinutes: null,
        dosageText: null,
      }),
    ]);

    return { user, customer, routine, steps };
  }

  it('full tracking flow', async () => {
    const today = getVnToday();
    const yesterday = shiftDate(today, -1);
    const activeFrom = new Date(`${shiftDate(today, -3)}T00:00:00.000Z`);

    // Empty customer
    const emptyUser = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        keycloakSub: `empty-${Date.now()}`,
        email: `empty-${Date.now()}@example.com`,
        name: 'Empty',
        provider: 'keycloak',
        roles: [Role.Customer],
        isActive: true,
      }),
    );
    await dataSource.getRepository(Customer).save(
      dataSource.getRepository(Customer).create({
        userId: emptyUser.id,
        gender: Gender.MALE,
        dateOfBirth: new Date('1990-01-01'),
      }),
    );
    const emptyToday = await tracking.getToday(
      emptyUser.id,
      RoutinePeriod.MORNING,
    );
    expect(emptyToday.sessionState).toBe(SessionState.EMPTY);
    expect(emptyToday.reason).toBe(EmptyRoutineReason.NO_ACTIVE_ROUTINE);

    const { user, routine, steps } = await seedRoutine({
      createdAt: activeFrom,
    });
    const [cleanser, toner] = steps.filter(
      (s) => s.period === RoutinePeriod.MORNING,
    );

    const todayView = await tracking.getToday(user.id, RoutinePeriod.MORNING);
    expect(todayView.routines).toHaveLength(1);
    expect(todayView.routines[0].sessionState).toBe(SessionState.NOT_STARTED);

    await tracking.completeStep(user.id, routine.id, cleanser.id);
    const afterSkip = await tracking.skipStep(user.id, routine.id, toner.id, {
      reason: SkipReason.OUT_OF_STOCK,
    });
    expect(afterSkip.progress).toEqual({
      completedCount: 1,
      skippedCount: 1,
      totalCount: 2,
      completionRate: 50,
    });
    expect(afterSkip.sessionState).toBe(SessionState.COMPLETED);
    expect(afterSkip.steps.map((s) => s.status).sort()).toEqual(
      [StepSessionStatus.COMPLETED, StepSessionStatus.SKIPPED].sort(),
    );

    // idempotent complete
    await tracking.completeStep(user.id, routine.id, cleanser.id);

    const checkIn = await tracking.createCheckIn(user.id, routine.id, {
      period: RoutinePeriod.MORNING,
      overallMood: CheckInMood.OK,
      acneLevel: 2,
      sideEffects: [{ type: SideEffectType.ITCHING, severity: 1 }],
    });
    expect(checkIn.completionRate).toBe(50);
    expect(checkIn.sideEffects).toHaveLength(1);

    const listed = await tracking.listCheckIns(
      user.id,
      routine.id,
      yesterday,
      today,
    );
    expect(listed).toHaveLength(1);

    const history = await tracking.getHistory(
      user.id,
      routine.id,
      shiftDate(today, -3),
      today,
    );
    const missed = history.days.find((d) => d.date === yesterday);
    expect(missed?.status).toBe(DayHistoryStatus.MISSED);
    const todayDay = history.days.find((d) => d.date === today);
    // Morning fully acted; evening not → PARTIAL for the calendar day
    expect(todayDay?.status).toBe(DayHistoryStatus.PARTIAL);

    const dayDetail = await tracking.getHistoryDay(
      user.id,
      routine.id,
      today,
      RoutinePeriod.MORNING,
    );
    expect(dayDetail.steps).toHaveLength(2);
    expect(dayDetail.checkIn?.id).toBe(checkIn.id);
  });
});
