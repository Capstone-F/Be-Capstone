import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OrderSource, OrderStatus } from '../commerce/enums';
import { Order } from '../commerce/order.entity';
import { LLM_ROUTINE_PROVIDER } from '../llm/llm-routine.types';
import { MockLlmRoutineProvider } from '../llm/mock-llm-routine.provider';
import { Customer } from '../users/customer.entity';
import { RoutinePeriod, RoutineStatus, RoutineType } from './enums';
import { RoutineGeneratorService } from './routine-generator.service';
import { Routine } from './routine.entity';

describe('RoutineGeneratorService', () => {
  let service: RoutineGeneratorService;
  let orderRepository: { findOne: jest.Mock };
  let routineRepository: { findOne: jest.Mock; find: jest.Mock };
  let customerRepository: { findOne: jest.Mock };

  const customer = {
    id: 'cust-1',
    userId: 'user-1',
    gender: 'FEMALE',
    dateOfBirth: null,
    skinTypeDetails: null,
  } as unknown as Customer;

  beforeEach(async () => {
    orderRepository = { findOne: jest.fn() };
    routineRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn(),
    };
    customerRepository = {
      findOne: jest.fn().mockResolvedValue(customer),
    };

    const savedSteps: unknown[] = [];
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
              savedSteps.push(value);
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

  it('generates a routine from a paid survey order', async () => {
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

    routineRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'routine-1',
        type: RoutineType.AI_RECOMMENDED,
        status: RoutineStatus.ACTIVE,
        title: 'Personalized routine',
        description: 'desc',
        sourceOrderId: 'order-1',
        customerSurveyId: 'survey-1',
        surveyRecommendationId: 'rec-1',
        createdAt: new Date(),
        steps: [
          {
            id: 'step-0',
            name: 'Serum A',
            period: RoutinePeriod.MORNING,
            stepOrder: 1,
            instructions: 'Apply morning and night',
            details: [{ productVariantId: 'v1' }],
            stepProtocols: [{ protocolId: 'p1' }],
          },
        ],
      });

    const routine = await service.generateForUser('user-1', {
      orderId: 'order-1',
    });
    expect(routine.id).toBe('routine-1');
    expect(routine.sourceOrderId).toBe('order-1');
    expect(routine.steps.length).toBeGreaterThan(0);
  });
});
