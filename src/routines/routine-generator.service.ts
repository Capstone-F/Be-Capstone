import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OrderSource, OrderStatus } from '../commerce/enums';
import { OrderItem } from '../commerce/order-item.entity';
import { Order } from '../commerce/order.entity';
import {
  LLM_ROUTINE_PROVIDER,
  type LlmRoutineProvider,
  type RoutineGenerationProductInput,
} from '../llm/llm-routine.types';
import { Customer } from '../users/customer.entity';
import { GenerateRoutineDto } from './dto/generate-routine.dto';
import {
  RoutineResponseDto,
  RoutineStepProductVariantDto,
  RoutineStepResponseDto,
} from './dto/routine-response.dto';
import { RoutinePeriod, RoutineStatus, RoutineType } from './enums';
import { RoutineStepDetails } from './routine-step-details.entity';
import { RoutineStepProtocol } from './routine-step-protocol.entity';
import { RoutineStep } from './routine-step.entity';
import { Routine } from './routine.entity';

const ROUTINE_DETAIL_RELATIONS = [
  'steps',
  'steps.stepProtocols',
  'steps.details',
  'steps.details.productVariant',
  'steps.details.productVariant.product',
] as const;

@Injectable()
export class RoutineGeneratorService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Routine)
    private readonly routineRepository: Repository<Routine>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @Inject(LLM_ROUTINE_PROVIDER)
    private readonly llm: LlmRoutineProvider,
    private readonly dataSource: DataSource,
  ) {}

  async generateForUser(
    userId: string,
    dto: GenerateRoutineDto,
  ): Promise<RoutineResponseDto> {
    const customer = await this.requireCustomer(userId);
    const order = await this.assertRoutineEligibleOrder(
      customer.id,
      dto.orderId,
    );

    const products = this.buildProductInputs(order.items ?? []);
    const labelCodes = this.collectLabelCodes(order);
    const age = this.computeAge(customer.dateOfBirth);

    const llmOutput = await this.llm.generateRoutine({
      customerProfile: {
        age,
        gender: customer.gender,
        skinTypeCode: customer.skinTypeDetails?.skinType?.code ?? null,
      },
      labelCodes,
      products,
    });

    const purchasedVariantIds = new Set(
      (order.items ?? []).map((i) => i.productVariantId),
    );
    const validSteps = llmOutput.steps.filter((s) =>
      purchasedVariantIds.has(s.productVariantId),
    );

    const routineId = await this.dataSource.transaction(async (manager) => {
      const routine = await manager.save(
        manager.create(Routine, {
          customerId: customer.id,
          type: RoutineType.AI_RECOMMENDED,
          status: RoutineStatus.ACTIVE,
          title: llmOutput.title,
          description: llmOutput.description,
          sourceOrderId: order.id,
          customerSurveyId: order.customerSurveyId,
          surveyRecommendationId: order.surveyRecommendationId,
          treatmentPhaseId: null,
          createdByExpertId: null,
        }),
      );

      for (const stepOut of validSteps) {
        const step = await manager.save(
          manager.create(RoutineStep, {
            routineId: routine.id,
            name: stepOut.name,
            period: stepOut.period,
            stepOrder: stepOut.stepOrder,
            instructions: stepOut.instructions,
            waitMinutes: stepOut.waitMinutes,
            dosageText: stepOut.dosageText,
          }),
        );

        if (stepOut.protocolId) {
          await manager.save(
            manager.create(RoutineStepProtocol, {
              routineStepId: step.id,
              protocolId: stepOut.protocolId,
              amountMl: stepOut.amountMl,
            }),
          );
        }

        await manager.save(
          manager.create(RoutineStepDetails, {
            routineStepId: step.id,
            productVariantId: stepOut.productVariantId,
            amountMl: stepOut.amountMl,
            date: null,
            period: stepOut.period,
            progressNote: null,
          }),
        );
      }

      return routine.id;
    });

    return this.getRoutineForCustomer(customer.id, routineId);
  }

  async listMyRoutines(userId: string): Promise<RoutineResponseDto[]> {
    const customer = await this.requireCustomer(userId);
    const routines = await this.routineRepository.find({
      where: { customerId: customer.id },
      relations: [...ROUTINE_DETAIL_RELATIONS],
      order: { createdAt: 'DESC' },
    });
    return routines.map((r) => this.toDto(r));
  }

  async getMyRoutineById(
    userId: string,
    routineId: string,
  ): Promise<RoutineResponseDto> {
    const customer = await this.requireCustomer(userId);
    const routine = await this.routineRepository.findOne({
      where: { id: routineId },
      relations: [...ROUTINE_DETAIL_RELATIONS],
    });
    if (!routine) {
      throw new NotFoundException(`Routine ${routineId} not found`);
    }
    if (routine.customerId !== customer.id) {
      throw new ForbiddenException('Routine does not belong to this customer');
    }
    return this.toDto(routine);
  }

  private async assertRoutineEligibleOrder(
    customerId: string,
    orderId: string,
  ): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: [
        'items',
        'items.productVariant',
        'items.productVariant.product',
        'items.surveyRecommendationItem',
        'items.surveyRecommendationItem.protocol',
        'customerSurvey',
        'customerSurvey.answers',
        'customerSurvey.answers.answerLabels',
        'customerSurvey.answers.answerLabels.label',
      ],
    });

    if (!order || order.customerId !== customerId) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    if (order.source !== OrderSource.SURVEY) {
      throw new ForbiddenException(
        'Routine generation is only available for products purchased from a skincare survey recommendation',
      );
    }
    if (order.status !== OrderStatus.PAID) {
      throw new ForbiddenException(
        'Order must be paid before generating a routine',
      );
    }
    if (!order.items?.length) {
      throw new ForbiddenException('Order has no purchasable items');
    }

    return order;
  }

  private buildProductInputs(
    items: OrderItem[],
  ): RoutineGenerationProductInput[] {
    const byVariant = new Map<string, RoutineGenerationProductInput>();
    for (const item of items) {
      const protocol = item.surveyRecommendationItem?.protocol;
      byVariant.set(item.productVariantId, {
        productVariantId: item.productVariantId,
        productName:
          item.productVariant?.product?.name ?? item.productVariantId,
        sku: item.productVariant?.sku ?? '',
        protocolId:
          protocol?.id ?? item.surveyRecommendationItem?.protocolId ?? null,
        protocolCode: protocol?.code ?? null,
        protocolName: protocol?.name ?? null,
        timeOfUse: protocol?.timeOfUse ?? null,
        instructions: protocol?.instructions ?? null,
      });
    }
    return [...byVariant.values()];
  }

  private collectLabelCodes(order: Order): string[] {
    const codes = new Set<string>();
    for (const answer of order.customerSurvey?.answers ?? []) {
      for (const al of answer.answerLabels ?? []) {
        if (al.label?.code) {
          codes.add(al.label.code);
        }
      }
    }
    return [...codes];
  }

  private computeAge(dateOfBirth: Date | null): number | null {
    if (!dateOfBirth) return null;
    const dob = new Date(dateOfBirth);
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
      age -= 1;
    }
    return age;
  }

  private async getRoutineForCustomer(
    customerId: string,
    routineId: string,
  ): Promise<RoutineResponseDto> {
    const routine = await this.routineRepository.findOne({
      where: { id: routineId, customerId },
      relations: [...ROUTINE_DETAIL_RELATIONS],
    });
    if (!routine) {
      throw new NotFoundException(`Routine ${routineId} not found`);
    }
    return this.toDto(routine);
  }

  private toDto(routine: Routine): RoutineResponseDto {
    const steps = [...(routine.steps ?? [])].sort(compareRoutineSteps);
    return {
      id: routine.id,
      type: routine.type,
      status: routine.status,
      title: routine.title,
      description: routine.description,
      sourceOrderId: routine.sourceOrderId,
      customerSurveyId: routine.customerSurveyId,
      surveyRecommendationId: routine.surveyRecommendationId,
      steps: steps.map((step) => this.toStepDto(step)),
      createdAt: routine.createdAt,
    };
  }

  private toStepDto(step: RoutineStep): RoutineStepResponseDto {
    const detail = step.details?.[0];
    const variant = detail?.productVariant;
    let productVariant: RoutineStepProductVariantDto | null = null;
    if (detail?.productVariantId) {
      productVariant = {
        id: detail.productVariantId,
        name: variant?.product?.name ?? detail.productVariantId,
        sku: variant?.sku ?? null,
        imageUrl: null,
      };
    }

    const amountRaw = detail?.amountMl;
    const amountMl =
      amountRaw === null || amountRaw === undefined ? null : Number(amountRaw);

    return {
      id: step.id,
      name: step.name,
      period: step.period,
      stepOrder: step.stepOrder,
      instructions: step.instructions,
      waitMinutes: step.waitMinutes ?? null,
      dosageText: step.dosageText ?? null,
      amountMl: Number.isFinite(amountMl as number) ? amountMl : null,
      protocolId: step.stepProtocols?.[0]?.protocolId ?? null,
      productVariant,
    };
  }

  private async requireCustomer(userId: string): Promise<Customer> {
    const customer = await this.customerRepository.findOne({
      where: { userId },
      relations: ['skinTypeDetails', 'skinTypeDetails.skinType'],
    });
    if (!customer) {
      throw new ForbiddenException('No customer profile for this user');
    }
    return customer;
  }
}

function periodRank(period: RoutinePeriod): number {
  return period === RoutinePeriod.MORNING ? 0 : 1;
}

export function compareRoutineSteps(
  a: Pick<RoutineStep, 'period' | 'stepOrder'>,
  b: Pick<RoutineStep, 'period' | 'stepOrder'>,
): number {
  const byPeriod = periodRank(a.period) - periodRank(b.period);
  if (byPeriod !== 0) return byPeriod;
  return a.stepOrder - b.stepOrder;
}
