import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OrderSource, OrderStatus } from '../commerce/enums';
import { Order } from '../commerce/order.entity';
import { LLM_ROUTINE_PROVIDER } from '../llm/llm-routine.types';
import { MockLlmRoutineProvider } from '../llm/mock-llm-routine.provider';
import { Customer } from '../users/customer.entity';
import { RoutinePeriod, RoutineStatus, RoutineType } from './enums';
import {
  compareRoutineSteps,
  RoutineGeneratorService,
} from './routine-generator.service';
import { Routine } from './routine.entity';

describe('compareRoutineSteps', () => {
  it('sorts MORNING before EVENING, then by stepOrder', () => {
    const steps = [
      { period: RoutinePeriod.EVENING, stepOrder: 1 },
      { period: RoutinePeriod.MORNING, stepOrder: 2 },
      { period: RoutinePeriod.MORNING, stepOrder: 1 },
      { period: RoutinePeriod.EVENING, stepOrder: 2 },
    ];
    const sorted = [...steps].sort(compareRoutineSteps);
    expect(sorted.map((s) => `${s.period}:${s.stepOrder}`)).toEqual([
      'MORNING:1',
      'MORNING:2',
      'EVENING:1',
      'EVENING:2',
    ]);
  });
});

describe('RoutineGeneratorService', () => {
  let service: RoutineGeneratorService;
  let orderRepository: { findOne: jest.Mock };
  let routineRepository: { findOne: jest.Mock; find: jest.Mock };
  let customerRepository: { findOne: jest.Mock };
  let savedSteps: Record<string, unknown>[];

  const customer = {
    id: 'cust-1',
    userId: 'user-1',
    gender: 'FEMALE',
    dateOfBirth: null,
    skinTypeDetails: null,
  } as unknown as Customer;

  const enrichedRoutine = {
    id: 'routine-1',
    customerId: 'cust-1',
    type: RoutineType.AI_RECOMMENDED,
    status: RoutineStatus.ACTIVE,
    title: 'Personalized routine',
    description: 'desc',
    sourceOrderId: 'order-1',
    customerSurveyId: 'survey-1',
    surveyRecommendationId: 'rec-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    steps: [
      {
        id: 'step-evening',
        name: 'Serum A',
        period: RoutinePeriod.EVENING,
        stepOrder: 1,
        instructions: 'Apply at night',
        waitMinutes: 5,
        dosageText: '2 drops',
        details: [
          {
            productVariantId: 'v1',
            amountMl: '2.00',
            productVariant: {
              id: 'v1',
              sku: 'SKU-1',
              imageUrl: 'https://placehold.co/400',
              product: { name: 'Serum A' },
            },
          },
        ],
        stepProtocols: [{ protocolId: 'p1' }],
      },
      {
        id: 'step-morning',
        name: 'Serum A',
        period: RoutinePeriod.MORNING,
        stepOrder: 1,
        instructions: 'Apply in the morning',
        waitMinutes: 0,
        dosageText: '2 drops',
        details: [
          {
            productVariantId: 'v1',
            amountMl: 2,
            productVariant: {
              id: 'v1',
              sku: 'SKU-1',
              imageUrl: 'https://placehold.co/400',
              product: { name: 'Serum A' },
            },
          },
        ],
        stepProtocols: [{ protocolId: 'p1' }],
      },
    ],
  };

  beforeEach(async () => {
    orderRepository = { findOne: jest.fn() };
    routineRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn(),
    };
    customerRepository = {
      findOne: jest.fn().mockResolvedValue(customer),
    };
    savedSteps = [];

    const dataSource = {
      transaction: async (cb: (m: unknown) => Promise<string>) =>
        cb({
          create: (_e: unknown, data: Record<string, unknown>) => ({ ...data }),
          save: async (value: { id?: string; routineId?: string }) => {
            if (!value.id) {
              value.id = value.routineId
                ? `step-${savedSteps.length}`
                : 'routine-1';
            }
            if (value.routineId) {
              savedSteps.push(value as Record<string, unknown>);
            }
            return value;
          },
        }),
    } as unknown as DataSource;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoutineGeneratorService,
        { provide: getRepositoryToken(Order), useValue: orderRepository },
        { provide: getRepositoryToken(Routine), useValue: routineRepository },
        {
          provide: getRepositoryToken(Customer),
          useValue: customerRepository,
        },
        { provide: LLM_ROUTINE_PROVIDER, useClass: MockLlmRoutineProvider },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(RoutineGeneratorService);
  });

  it('rejects catalog orders', async () => {
    orderRepository.findOne.mockResolvedValue({
      id: 'order-1',
      customerId: 'cust-1',
      source: OrderSource.CATALOG,
      status: OrderStatus.PAID,
      items: [{ productVariantId: 'v1' }],
    });

    await expect(
      service.generateForUser('user-1', { orderId: 'order-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects unpaid survey orders', async () => {
    orderRepository.findOne.mockResolvedValue({
      id: 'order-1',
      customerId: 'cust-1',
      source: OrderSource.SURVEY,
      status: OrderStatus.PENDING,
      items: [{ productVariantId: 'v1' }],
    });

    await expect(
      service.generateForUser('user-1', { orderId: 'order-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('generates an enriched routine from a paid survey order', async () => {
    orderRepository.findOne.mockResolvedValue({
      id: 'order-1',
      customerId: 'cust-1',
      source: OrderSource.SURVEY,
      status: OrderStatus.PAID,
      customerSurveyId: 'survey-1',
      surveyRecommendationId: 'rec-1',
      items: [
        {
          productVariantId: 'v1',
          productVariant: {
            id: 'v1',
            sku: 'SKU-1',
            product: { name: 'Serum A' },
          },
          surveyRecommendationItem: {
            protocolId: 'p1',
            protocol: {
              id: 'p1',
              code: 'niacinamide_general',
              name: 'Niacinamide',
              timeOfUse: 'AM_PM',
              instructions: 'Apply morning and night',
            },
          },
        },
      ],
      customerSurvey: { answers: [] },
    });

    routineRepository.findOne.mockResolvedValue(enrichedRoutine);

    const routine = await service.generateForUser('user-1', {
      orderId: 'order-1',
    });

    expect(routine.id).toBe('routine-1');
    expect(routine.type).toBe(RoutineType.AI_RECOMMENDED);
    expect(routine.sourceOrderId).toBe('order-1');
    expect(routine.steps).toHaveLength(2);
    // MORNING before EVENING
    expect(routine.steps.map((s) => s.period)).toEqual([
      RoutinePeriod.MORNING,
      RoutinePeriod.EVENING,
    ]);

    const morning = routine.steps[0];
    expect(morning.waitMinutes).toBe(0);
    expect(morning.dosageText).toBe('2 drops');
    expect(morning.amountMl).toBe(2);
    expect(morning.protocolId).toBe('p1');
    expect(morning.productVariant).toEqual({
      id: 'v1',
      name: 'Serum A',
      sku: 'SKU-1',
      imageUrl: 'https://placehold.co/400',
    });

    expect(savedSteps.length).toBeGreaterThan(0);
    expect(savedSteps[0]).toEqual(
      expect.objectContaining({
        waitMinutes: expect.any(Number),
        dosageText: expect.any(String),
      }),
    );
  });

  it('maps missing product as null productVariant without crashing', async () => {
    routineRepository.findOne.mockResolvedValue({
      ...enrichedRoutine,
      steps: [
        {
          id: 'step-orphan',
          name: 'Orphan step',
          period: RoutinePeriod.MORNING,
          stepOrder: 1,
          instructions: 'Do something',
          waitMinutes: null,
          dosageText: null,
          details: [],
          stepProtocols: [],
        },
      ],
    });

    const routine = await service.getMyRoutineById('user-1', 'routine-1');
    expect(routine.steps[0].productVariant).toBeNull();
    expect(routine.steps[0].amountMl).toBeNull();
    expect(routine.steps[0].protocolId).toBeNull();
  });

  it('returns owner routine by id', async () => {
    routineRepository.findOne.mockResolvedValue(enrichedRoutine);
    const routine = await service.getMyRoutineById('user-1', 'routine-1');
    expect(routine.id).toBe('routine-1');
  });

  it('forbids access to another customer routine', async () => {
    routineRepository.findOne.mockResolvedValue({
      ...enrichedRoutine,
      customerId: 'cust-other',
    });

    await expect(
      service.getMyRoutineById('user-1', 'routine-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws NotFound when routine does not exist', async () => {
    routineRepository.findOne.mockResolvedValue(null);

    await expect(
      service.getMyRoutineById('user-1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists enriched routines for the customer', async () => {
    routineRepository.find.mockResolvedValue([enrichedRoutine]);
    const list = await service.listMyRoutines('user-1');
    expect(list).toHaveLength(1);
    expect(list[0].steps[0].productVariant?.name).toBe('Serum A');
  });
});
