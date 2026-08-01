import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { TransactionType } from '../commerce/enums';
import { ConsultationRequest } from '../consultations/consultation-request.entity';
import { Feedback } from '../consultations/feedback.entity';
import { ConsultationStatus } from '../consultations/enums';
import { Ingredient } from '../ingredients/ingredient.entity';
import { TimeOfUse } from '../ingredients/enums';
import { ProductIngredient } from '../products/product-ingredient.entity';
import { ProductProtocol } from '../products/product-protocol.entity';
import { ProductVariant } from '../products/product-variant.entity';
import {
  RoutinePeriod,
  RoutineStatus,
  RoutineType,
  StepCompletionStatus,
} from '../routines/enums';
import { RoutineStepCompletion } from '../routines/routine-step-completion.entity';
import { RoutineStepDetails } from '../routines/routine-step-details.entity';
import { RoutineStepProtocol } from '../routines/routine-step-protocol.entity';
import { RoutineStep } from '../routines/routine-step.entity';
import { Routine } from '../routines/routine.entity';
import { StockBatch } from '../stock/stock-batch.entity';
import { CustomerAllergy } from '../users/customer-allergy.entity';
import { Customer } from '../users/customer.entity';
import { Expert } from '../users/expert.entity';
import { WalletService } from '../wallet/wallet.service';
import {
  TreatmentCancelledBy,
  TreatmentEventType,
  TreatmentPhaseStatus,
  TreatmentStatus,
} from './enums';
import {
  CancelTreatmentDto,
  CreateTreatmentDto,
  CreateTreatmentEventDto,
  CreateTreatmentPhaseDto,
  SetPhaseIngredientsDto,
  SetPhaseProductsDto,
  UpdateExpertRoutineDto,
  UpdateTreatmentPhaseDto,
} from './dto/treatment.dto';
import {
  TreatmentChartConsultationResultDto,
  TreatmentChartProductUsedDto,
  TreatmentChartResponseDto,
  TreatmentChartSessionDto,
  TreatmentEventResponseDto,
} from './dto/treatment-chart-response.dto';
import {
  ProductCandidateDto,
  TreatmentPhaseResponseDto,
  TreatmentResponseDto,
} from './dto/treatment-response.dto';
import { TreatmentEvent } from './treatment-event.entity';
import { TreatmentPhaseIngredient } from './treatment-phase-ingredient.entity';
import { TreatmentPhaseProduct } from './treatment-phase-product.entity';
import { TreatmentPhase } from './treatment-phase.entity';
import { Treatment } from './treatment.entity';

@Injectable()
export class TreatmentsService {
  constructor(
    @InjectRepository(Treatment)
    private readonly treatmentRepo: Repository<Treatment>,
    @InjectRepository(TreatmentPhase)
    private readonly phaseRepo: Repository<TreatmentPhase>,
    @InjectRepository(TreatmentPhaseIngredient)
    private readonly phaseIngredientRepo: Repository<TreatmentPhaseIngredient>,
    @InjectRepository(TreatmentPhaseProduct)
    private readonly phaseProductRepo: Repository<TreatmentPhaseProduct>,
    @InjectRepository(TreatmentEvent)
    private readonly eventRepo: Repository<TreatmentEvent>,
    @InjectRepository(Expert)
    private readonly expertRepo: Repository<Expert>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(ConsultationRequest)
    private readonly consultationRepo: Repository<ConsultationRequest>,
    @InjectRepository(Ingredient)
    private readonly ingredientRepo: Repository<Ingredient>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(ProductIngredient)
    private readonly productIngredientRepo: Repository<ProductIngredient>,
    @InjectRepository(ProductProtocol)
    private readonly productProtocolRepo: Repository<ProductProtocol>,
    @InjectRepository(Routine)
    private readonly routineRepo: Repository<Routine>,
    @InjectRepository(RoutineStep)
    private readonly stepRepo: Repository<RoutineStep>,
    @InjectRepository(RoutineStepCompletion)
    private readonly completionRepo: Repository<RoutineStepCompletion>,
    @InjectRepository(CustomerAllergy)
    private readonly allergyRepo: Repository<CustomerAllergy>,
    @InjectRepository(StockBatch)
    private readonly stockBatchRepo: Repository<StockBatch>,
    private readonly walletService: WalletService,
    private readonly dataSource: DataSource,
  ) {}

  async createTreatment(
    expertUserId: string,
    dto: CreateTreatmentDto,
  ): Promise<TreatmentResponseDto> {
    const expert = await this.requireExpert(expertUserId);
    let customer = await this.customerRepo.findOne({
      where: [{ id: dto.customerId }, { userId: dto.customerId }],
    });
    if (!customer) {
      try {
        customer = await this.customerRepo.save(
          this.customerRepo.create({
            userId: dto.customerId,
          }),
        );
      } catch (err) {
        console.error(
          `Failed to auto-create customer for userId=${dto.customerId}: ${err}`,
        );
        throw new NotFoundException(`Customer ${dto.customerId} not found`);
      }
    }

    if (dto.sourceConsultationId) {
      const consultation = await this.consultationRepo.findOne({
        where: { id: dto.sourceConsultationId },
      });
      if (!consultation) {
        throw new NotFoundException('Source consultation not found');
      }
      if (
        consultation.expertId !== expert.id ||
        consultation.customerId !== customer.id
      ) {
        throw new BadRequestException(
          'Source consultation does not match expert/customer',
        );
      }
      // Plan is typically drafted during the live session (IN_PROGRESS), then
      // the expert may still link after COMPLETED. Other statuses are rejected.
      const allowed: ConsultationStatus[] = [
        ConsultationStatus.IN_PROGRESS,
        ConsultationStatus.COMPLETED,
      ];
      if (!allowed.includes(consultation.status)) {
        throw new BadRequestException(
          `Source consultation must be IN_PROGRESS or COMPLETED (current: ${consultation.status})`,
        );
      }
    }

    const treatment = await this.treatmentRepo.save(
      this.treatmentRepo.create({
        customerId: customer.id,
        expertId: expert.id,
        clinicId: expert.clinicId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        status: TreatmentStatus.DRAFT,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        sourceConsultationId: dto.sourceConsultationId ?? null,
        totalPriceVnd: null,
      }),
    );

    return this.getTreatmentDetail(treatment.id);
  }

  async addPhase(
    expertUserId: string,
    treatmentId: string,
    dto: CreateTreatmentPhaseDto,
  ): Promise<TreatmentPhaseResponseDto> {
    const { treatment } = await this.requireExpertTreatment(
      expertUserId,
      treatmentId,
    );
    this.assertDraftEditable(treatment);

    const phase = await this.phaseRepo.save(
      this.phaseRepo.create({
        treatmentId,
        phaseType: dto.phaseType,
        phaseOrder: dto.phaseOrder ?? 0,
        title: dto.title?.trim() || null,
        goals: dto.goals?.trim() || null,
        notes: dto.notes?.trim() || null,
        noteByExpert: dto.noteByExpert?.trim() || null,
        priceVnd: String(dto.priceVnd),
        status: TreatmentPhaseStatus.PENDING,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      }),
    );

    await this.clearSubmissionLock(treatmentId);
    return this.toPhaseDto(await this.loadPhase(phase.id));
  }

  async updatePhase(
    expertUserId: string,
    phaseId: string,
    dto: UpdateTreatmentPhaseDto,
  ): Promise<TreatmentPhaseResponseDto> {
    const phase = await this.loadPhase(phaseId);
    await this.requireExpertTreatment(expertUserId, phase.treatmentId);
    this.assertDraftEditable(phase.treatment);

    if (dto.phaseType !== undefined) phase.phaseType = dto.phaseType;
    if (dto.phaseOrder !== undefined) phase.phaseOrder = dto.phaseOrder;
    if (dto.title !== undefined) phase.title = dto.title?.trim() || null;
    if (dto.goals !== undefined) phase.goals = dto.goals?.trim() || null;
    if (dto.notes !== undefined) phase.notes = dto.notes?.trim() || null;
    if (dto.noteByExpert !== undefined) {
      phase.noteByExpert = dto.noteByExpert?.trim() || null;
    }
    if (dto.priceVnd !== undefined) phase.priceVnd = String(dto.priceVnd);
    if (dto.startDate !== undefined) {
      phase.startDate = dto.startDate ? new Date(dto.startDate) : null;
    }
    if (dto.endDate !== undefined) {
      phase.endDate = dto.endDate ? new Date(dto.endDate) : null;
    }

    await this.phaseRepo.save(phase);
    await this.clearSubmissionLock(phase.treatmentId);
    return this.toPhaseDto(await this.loadPhase(phaseId));
  }

  async deletePhase(expertUserId: string, phaseId: string): Promise<void> {
    const phase = await this.loadPhase(phaseId);
    await this.requireExpertTreatment(expertUserId, phase.treatmentId);
    this.assertDraftEditable(phase.treatment);
    await this.phaseRepo.delete({ id: phaseId });
    await this.clearSubmissionLock(phase.treatmentId);
  }

  async listMyTreatments(
    userId: string,
    asExpert: boolean,
  ): Promise<TreatmentResponseDto[]> {
    if (asExpert) {
      const expert = await this.requireExpert(userId);
      const rows = await this.treatmentRepo.find({
        where: { expertId: expert.id },
        relations: [
          'phases',
          'phases.phaseIngredients',
          'phases.phaseIngredients.ingredient',
          'phases.phaseProducts',
          'phases.phaseProducts.productVariant',
          'phases.routines',
        ],
        order: { createdAt: 'DESC' },
      });
      return rows.map((t) => this.toTreatmentDto(t));
    }

    const customer = await this.customerRepo.findOne({ where: { userId } });
    if (!customer) return [];
    const rows = await this.treatmentRepo.find({
      where: { customerId: customer.id },
      relations: [
        'phases',
        'phases.phaseIngredients',
        'phases.phaseIngredients.ingredient',
        'phases.phaseProducts',
        'phases.phaseProducts.productVariant',
        'phases.routines',
      ],
      order: { createdAt: 'DESC' },
    });
    return rows.map((t) => this.toTreatmentDto(t));
  }

  async getTreatmentForUser(
    userId: string,
    treatmentId: string,
    roles: { isExpert: boolean; isCustomer: boolean },
  ): Promise<TreatmentResponseDto> {
    const treatment = await this.loadTreatment(treatmentId);
    await this.assertCanView(userId, treatment, roles);
    return this.toTreatmentDto(treatment);
  }

  async submitForPayment(
    expertUserId: string,
    treatmentId: string,
  ): Promise<TreatmentResponseDto> {
    const { treatment } = await this.requireExpertTreatment(
      expertUserId,
      treatmentId,
    );
    this.assertDraftEditable(treatment);

    const phases = await this.phaseRepo.find({ where: { treatmentId } });
    if (phases.length === 0) {
      throw new BadRequestException('Treatment must have at least one phase');
    }

    const missingNote = phases.find((p) => !p.noteByExpert?.trim());
    if (missingNote) {
      throw new BadRequestException(
        'Each phase requires noteByExpert before submit (why this phase/plan was created)',
      );
    }

    const total = phases.reduce(
      (sum, p) => sum + BigInt(p.priceVnd || '0'),
      0n,
    );
    if (total <= 0n) {
      throw new BadRequestException('Total plan price must be greater than 0');
    }

    if (!treatment.startDate || !treatment.endDate) {
      throw new BadRequestException(
        'Treatment startDate and endDate are required before payment',
      );
    }

    treatment.totalPriceVnd = String(total);
    treatment.submittedAt = new Date();
    await this.treatmentRepo.save(treatment);
    return this.getTreatmentDetail(treatmentId);
  }

  async payTreatment(
    customerUserId: string,
    treatmentId: string,
  ): Promise<TreatmentResponseDto> {
    const treatment = await this.loadTreatment(treatmentId);
    const customer = await this.customerRepo.findOne({
      where: { userId: customerUserId },
    });
    if (!customer || treatment.customerId !== customer.id) {
      throw new ForbiddenException('Only the owning customer can pay');
    }
    if (treatment.status !== TreatmentStatus.DRAFT) {
      throw new BadRequestException(
        `Treatment is not payable (status: ${treatment.status})`,
      );
    }
    if (treatment.paidAt) {
      throw new BadRequestException('Treatment is already paid');
    }
    if (!treatment.submittedAt) {
      throw new BadRequestException(
        'Treatment plan has not been submitted by the expert',
      );
    }

    await this.recomputeTotalPrice(treatmentId);
    const reloaded = await this.loadTreatment(treatmentId);
    const total = Number(reloaded.totalPriceVnd ?? 0);
    if (!reloaded.phases?.length || total <= 0) {
      throw new BadRequestException(
        'Treatment has no payable phases (expert must submit plan first)',
      );
    }
    if (!reloaded.startDate || !reloaded.endDate) {
      throw new BadRequestException(
        'Treatment startDate and endDate are required',
      );
    }

    const tx = await this.walletService.debit({
      type: TransactionType.TREATMENT_PLAN_PAYMENT,
      amountVnd: total,
      userId: customerUserId,
      treatmentId: reloaded.id,
      note: `Treatment plan payment ${reloaded.id}`,
    });

    reloaded.paidAt = new Date();
    reloaded.paidTransactionId = tx.id;
    reloaded.status = TreatmentStatus.ACTIVE;
    reloaded.totalPriceVnd = String(total);
    await this.treatmentRepo.save(reloaded);

    return this.getTreatmentDetail(treatmentId);
  }

  async setPhaseIngredients(
    expertUserId: string,
    phaseId: string,
    dto: SetPhaseIngredientsDto,
  ): Promise<TreatmentPhaseResponseDto> {
    const phase = await this.loadPhase(phaseId);
    await this.requireExpertTreatment(expertUserId, phase.treatmentId);
    this.assertPaidActive(phase.treatment);

    const uniqueIds = [...new Set(dto.ingredientIds)];
    if (uniqueIds.length > 0) {
      const found = await this.ingredientRepo.find({
        where: { id: In(uniqueIds) },
      });
      if (found.length !== uniqueIds.length) {
        throw new BadRequestException('One or more ingredientIds are invalid');
      }
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(TreatmentPhaseIngredient, {
        treatmentPhaseId: phaseId,
      });
      if (uniqueIds.length > 0) {
        await manager.save(
          TreatmentPhaseIngredient,
          uniqueIds.map((ingredientId) =>
            manager.create(TreatmentPhaseIngredient, {
              treatmentPhaseId: phaseId,
              ingredientId,
            }),
          ),
        );
      }
    });

    return this.toPhaseDto(await this.loadPhase(phaseId));
  }

  async listProductCandidates(
    expertUserId: string,
    phaseId: string,
  ): Promise<ProductCandidateDto[]> {
    const phase = await this.loadPhase(phaseId);
    await this.requireExpertTreatment(expertUserId, phase.treatmentId);
    this.assertPaidActive(phase.treatment);

    const ingredientIds = (phase.phaseIngredients ?? []).map(
      (r) => r.ingredientId,
    );
    if (ingredientIds.length === 0) {
      return [];
    }

    const mappings = await this.productIngredientRepo.find({
      where: { ingredientId: In(ingredientIds) },
      relations: ['product', 'product.variants'],
    });

    const allergyLabels = await this.allergyRepo.find({
      where: { customerId: phase.treatment.customerId },
      relations: ['label'],
    });
    const allergyCodes = new Set(
      allergyLabels.map((a) => a.label?.code?.toLowerCase()).filter(Boolean),
    );

    const scoreByVariant = new Map<
      string,
      {
        variant: ProductVariant;
        productId: string;
        productName: string;
        matched: Set<string>;
      }
    >();

    for (const m of mappings) {
      const variants = (m.product?.variants ?? []).filter((v) => v.isActive);
      for (const variant of variants) {
        const existing = scoreByVariant.get(variant.id);
        if (existing) {
          existing.matched.add(m.ingredientId);
        } else {
          scoreByVariant.set(variant.id, {
            variant,
            productId: m.productId,
            productName: m.product?.name ?? '',
            matched: new Set([m.ingredientId]),
          });
        }
      }
    }

    const results: ProductCandidateDto[] = [];
    for (const entry of scoreByVariant.values()) {
      const nameLower = entry.productName.toLowerCase();
      if ([...allergyCodes].some((code) => nameLower.includes(code))) {
        continue;
      }

      const stock = await this.sumStock(entry.variant.id);
      if (stock <= 0) continue;

      results.push({
        productVariantId: entry.variant.id,
        productId: entry.productId,
        productName: entry.productName,
        sku: entry.variant.sku,
        priceVnd: entry.variant.priceVnd,
        matchScore: entry.matched.size,
        matchedIngredientIds: [...entry.matched],
        stockQuantity: stock,
      });
    }

    results.sort(
      (a, b) =>
        b.matchScore - a.matchScore ||
        a.priceVnd - b.priceVnd ||
        a.sku.localeCompare(b.sku),
    );
    return results;
  }

  async setPhaseProducts(
    expertUserId: string,
    phaseId: string,
    dto: SetPhaseProductsDto,
  ): Promise<TreatmentPhaseResponseDto> {
    const phase = await this.loadPhase(phaseId);
    await this.requireExpertTreatment(expertUserId, phase.treatmentId);
    this.assertPaidActive(phase.treatment);

    const uniqueIds = [...new Set(dto.productVariantIds)];
    if (uniqueIds.length > 0) {
      const found = await this.variantRepo.find({
        where: { id: In(uniqueIds), isActive: true },
      });
      if (found.length !== uniqueIds.length) {
        throw new BadRequestException(
          'One or more productVariantIds are invalid',
        );
      }
    }

    const candidates =
      uniqueIds.length > 0
        ? await this.listProductCandidates(expertUserId, phaseId)
        : [];
    const scoreMap = new Map(
      candidates.map((c) => [c.productVariantId, c.matchScore]),
    );

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(TreatmentPhaseProduct, {
        treatmentPhaseId: phaseId,
      });
      if (uniqueIds.length > 0) {
        await manager.save(
          TreatmentPhaseProduct,
          uniqueIds.map((productVariantId) =>
            manager.create(TreatmentPhaseProduct, {
              treatmentPhaseId: phaseId,
              productVariantId,
              matchScore: scoreMap.get(productVariantId) ?? null,
            }),
          ),
        );
      }
    });

    return this.toPhaseDto(await this.loadPhase(phaseId));
  }

  async generateRoutine(
    expertUserId: string,
    phaseId: string,
  ): Promise<Routine> {
    const phase = await this.loadPhase(phaseId);
    const { expert } = await this.requireExpertTreatment(
      expertUserId,
      phase.treatmentId,
    );
    this.assertPaidActive(phase.treatment);

    const products = phase.phaseProducts ?? [];
    if (products.length === 0) {
      throw new BadRequestException(
        'Select products for the phase before generating a routine',
      );
    }

    const variantIds = products.map((p) => p.productVariantId);
    const variants = await this.variantRepo.find({
      where: { id: In(variantIds) },
      relations: ['product'],
    });
    const variantById = new Map(variants.map((v) => [v.id, v]));

    const protocols = await this.productProtocolRepo.find({
      where: { productId: In(variants.map((v) => v.productId)) },
      relations: ['protocol'],
    });

    type StepDraft = {
      name: string;
      period: RoutinePeriod;
      stepOrder: number;
      instructions: string | null;
      productVariantId: string;
      protocolId: string | null;
    };

    const drafts: StepDraft[] = [];
    let morningOrder = 0;
    let eveningOrder = 0;

    for (const productRow of products) {
      const variant = variantById.get(productRow.productVariantId);
      if (!variant) continue;

      const productProtocols = protocols.filter(
        (pp) => pp.productId === variant.productId,
      );

      if (productProtocols.length === 0) {
        drafts.push({
          name: variant.product?.name ?? variant.sku,
          period: RoutinePeriod.EVENING,
          stepOrder: eveningOrder++,
          instructions: null,
          productVariantId: variant.id,
          protocolId: null,
        });
        continue;
      }

      for (const pp of productProtocols) {
        const protocol = pp.protocol;
        const periods = this.periodsFromTimeOfUse(protocol?.timeOfUse ?? null);
        for (const period of periods) {
          const stepOrder =
            period === RoutinePeriod.MORNING ? morningOrder++ : eveningOrder++;
          drafts.push({
            name: protocol?.name ?? variant.product?.name ?? variant.sku,
            period,
            stepOrder,
            instructions: protocol?.instructions ?? null,
            productVariantId: variant.id,
            protocolId: protocol?.id ?? null,
          });
        }
      }
    }

    return this.dataSource.transaction(async (manager) => {
      // Replace existing draft expert routines for this phase
      const existing = await manager.find(Routine, {
        where: {
          treatmentPhaseId: phaseId,
          type: RoutineType.EXPERT_PRESCRIBED,
        },
      });
      for (const r of existing) {
        if (r.status === RoutineStatus.DRAFT) {
          await manager.delete(Routine, { id: r.id });
        }
      }

      const routine = await manager.save(
        Routine,
        manager.create(Routine, {
          customerId: phase.treatment.customerId,
          treatmentPhaseId: phaseId,
          createdByExpertId: expert.id,
          type: RoutineType.EXPERT_PRESCRIBED,
          title: phase.title
            ? `${phase.title} routine`
            : `Phase ${phase.phaseOrder + 1} routine`,
          description: phase.goals,
          status: RoutineStatus.DRAFT,
        }),
      );

      for (const draft of drafts) {
        const step = await manager.save(
          RoutineStep,
          manager.create(RoutineStep, {
            routineId: routine.id,
            name: draft.name,
            period: draft.period,
            stepOrder: draft.stepOrder,
            instructions: draft.instructions,
            waitMinutes: null,
            dosageText: null,
          }),
        );

        await manager.save(
          RoutineStepDetails,
          manager.create(RoutineStepDetails, {
            routineStepId: step.id,
            productVariantId: draft.productVariantId,
            amountMl: null,
            date: null,
            period: draft.period,
            progressNote: null,
          }),
        );

        if (draft.protocolId) {
          await manager.save(
            RoutineStepProtocol,
            manager.create(RoutineStepProtocol, {
              routineStepId: step.id,
              protocolId: draft.protocolId,
              amountMl: null,
            }),
          );
        }
      }

      return manager.findOneOrFail(Routine, {
        where: { id: routine.id },
        relations: [
          'steps',
          'steps.details',
          'steps.details.productVariant',
          'steps.stepProtocols',
          'steps.stepProtocols.protocol',
        ],
        order: { steps: { stepOrder: 'ASC' } },
      });
    });
  }

  async updateRoutine(
    expertUserId: string,
    routineId: string,
    dto: UpdateExpertRoutineDto,
  ): Promise<Routine> {
    const routine = await this.routineRepo.findOne({
      where: { id: routineId },
      relations: ['steps', 'treatmentPhase', 'treatmentPhase.treatment'],
    });
    if (!routine || routine.type !== RoutineType.EXPERT_PRESCRIBED) {
      throw new NotFoundException('Expert routine not found');
    }
    if (!routine.treatmentPhaseId) {
      throw new BadRequestException(
        'Routine is not linked to a treatment phase',
      );
    }

    await this.requireExpertTreatment(
      expertUserId,
      routine.treatmentPhase!.treatmentId,
    );

    if (dto.title !== undefined) routine.title = dto.title.trim();
    if (dto.description !== undefined) {
      routine.description = dto.description?.trim() || null;
    }
    if (
      routine.status !== RoutineStatus.DRAFT &&
      routine.status !== RoutineStatus.ACTIVE
    ) {
      throw new BadRequestException(
        `Routine cannot be edited in status ${routine.status}`,
      );
    }

    await this.routineRepo.save(routine);

    if (dto.steps?.length) {
      const steps = await this.stepRepo.find({
        where: { routineId },
        order: { stepOrder: 'ASC' },
      });
      for (let i = 0; i < Math.min(steps.length, dto.steps.length); i++) {
        const step = steps[i];
        const patch = dto.steps[i];
        if (patch.name !== undefined) step.name = patch.name;
        if (patch.period !== undefined) {
          step.period = patch.period as RoutinePeriod;
        }
        if (patch.stepOrder !== undefined) step.stepOrder = patch.stepOrder;
        if (patch.instructions !== undefined) {
          step.instructions = patch.instructions;
        }
        if (patch.waitMinutes !== undefined) {
          step.waitMinutes = patch.waitMinutes;
        }
        if (patch.dosageText !== undefined) {
          step.dosageText = patch.dosageText;
        }
        await this.stepRepo.save(step);
      }
    }

    // Promote draft to saved state when expert edits/saves
    if (routine.status === RoutineStatus.DRAFT) {
      routine.status = RoutineStatus.ACTIVE;
      await this.routineRepo.save(routine);
    }

    return this.routineRepo.findOneOrFail({
      where: { id: routineId },
      relations: [
        'steps',
        'steps.details',
        'steps.details.productVariant',
        'steps.stepProtocols',
      ],
      order: { steps: { stepOrder: 'ASC' } },
    });
  }

  async saveRoutineDraft(
    expertUserId: string,
    routineId: string,
  ): Promise<Routine> {
    const routine = await this.routineRepo.findOne({
      where: { id: routineId },
      relations: ['treatmentPhase'],
    });
    if (!routine || routine.type !== RoutineType.EXPERT_PRESCRIBED) {
      throw new NotFoundException('Expert routine not found');
    }
    if (!routine.treatmentPhaseId) {
      throw new BadRequestException(
        'Routine is not linked to a treatment phase',
      );
    }
    await this.requireExpertTreatment(
      expertUserId,
      routine.treatmentPhase!.treatmentId,
    );

    if (routine.status === RoutineStatus.DRAFT) {
      routine.status = RoutineStatus.ACTIVE;
      await this.routineRepo.save(routine);
    }
    return routine;
  }

  async activatePhase(
    expertUserId: string,
    phaseId: string,
  ): Promise<TreatmentPhaseResponseDto> {
    const phase = await this.loadPhase(phaseId);
    await this.requireExpertTreatment(expertUserId, phase.treatmentId);
    this.assertPaidActive(phase.treatment);

    const routines = await this.routineRepo.find({
      where: { treatmentPhaseId: phaseId },
    });

    if (routines.length > 0) {
      const hasUnsavedDraft = routines.some(
        (r) => r.status === RoutineStatus.DRAFT,
      );
      if (hasUnsavedDraft) {
        throw new BadRequestException(
          'Save all phase routines before activating (DRAFT routines must be saved)',
        );
      }
    } else {
      // No routine allowed — require dates or notes
      if (!phase.startDate && !phase.endDate && !phase.notes) {
        throw new BadRequestException(
          'Phase without routine requires startDate/endDate or notes',
        );
      }
    }

    await this.dataSource.transaction(async (manager) => {
      const activeOthers = await manager.find(TreatmentPhase, {
        where: {
          treatmentId: phase.treatmentId,
          status: TreatmentPhaseStatus.ACTIVE,
        },
      });
      for (const other of activeOthers) {
        if (other.id === phaseId) continue;
        other.status = TreatmentPhaseStatus.COMPLETED;
        await manager.save(TreatmentPhase, other);
      }

      phase.status = TreatmentPhaseStatus.ACTIVE;
      if (!phase.startDate) {
        phase.startDate = new Date();
      }
      await manager.save(TreatmentPhase, phase);

      // Ensure linked saved routines stay ACTIVE for customer tracking
      for (const routine of routines) {
        if (routine.status !== RoutineStatus.ACTIVE) {
          routine.status = RoutineStatus.ACTIVE;
          await manager.save(Routine, routine);
        }
      }
    });

    return this.toPhaseDto(await this.loadPhase(phaseId));
  }

  async cancelTreatment(
    userId: string,
    roles: { isExpert: boolean; isCustomer: boolean },
    treatmentId: string,
    dto: CancelTreatmentDto,
  ): Promise<TreatmentResponseDto> {
    const treatment = await this.loadTreatment(treatmentId);
    const cancelledBy = await this.resolveCancelActor(userId, roles, treatment);

    if (
      treatment.status !== TreatmentStatus.ACTIVE &&
      treatment.status !== TreatmentStatus.PAUSED
    ) {
      throw new BadRequestException(
        `Treatment can only be cancelled when ACTIVE or PAUSED (current: ${treatment.status})`,
      );
    }

    const pendingRefund = (treatment.phases ?? [])
      .filter((p) => p.status === TreatmentPhaseStatus.PENDING)
      .reduce((sum, p) => sum + BigInt(p.priceVnd || '0'), 0n);

    let refundTxId: string | null = null;
    let refundedAmount: string | null = null;

    if (pendingRefund > 0n && treatment.paidAt) {
      const customer = await this.customerRepo.findOne({
        where: { id: treatment.customerId },
      });
      if (!customer?.userId) {
        throw new BadRequestException(
          'Customer wallet user is required to refund',
        );
      }
      const tx = await this.walletService.credit({
        type: TransactionType.REFUND,
        amountVnd: pendingRefund.toString(),
        userId: customer.userId,
        treatmentId: treatment.id,
        note: `Refund PENDING phases for treatment ${treatment.id}`,
      });
      refundTxId = tx.id;
      refundedAmount = pendingRefund.toString();
    }

    treatment.status = TreatmentStatus.CANCELLED;
    treatment.cancelledAt = new Date();
    treatment.cancelReason = dto.reason?.trim() || null;
    treatment.cancelledBy = cancelledBy;
    treatment.refundTransactionId = refundTxId;
    treatment.refundedAmountVnd = refundedAmount;
    await this.treatmentRepo.save(treatment);

    const phaseIds = (treatment.phases ?? []).map((p) => p.id);
    if (phaseIds.length > 0) {
      const activeRoutines = await this.routineRepo.find({
        where: {
          treatmentPhaseId: In(phaseIds),
          status: RoutineStatus.ACTIVE,
        },
      });
      for (const routine of activeRoutines) {
        routine.status = RoutineStatus.PAUSED;
        await this.routineRepo.save(routine);
      }
    }

    return this.getTreatmentDetail(treatmentId);
  }

  async createEvent(
    userId: string,
    roles: { isExpert: boolean; isCustomer: boolean },
    treatmentId: string,
    dto: CreateTreatmentEventDto,
  ): Promise<TreatmentEventResponseDto> {
    const treatment = await this.loadTreatment(treatmentId);
    await this.assertCanMutateEvents(userId, treatment, roles);

    if (
      dto.type === TreatmentEventType.PROGRESS_PHOTO &&
      !dto.photoUrl?.trim()
    ) {
      throw new BadRequestException(
        'photoUrl is required for PROGRESS_PHOTO events',
      );
    }

    let createdByExpertId: string | null = null;
    if (roles.isExpert) {
      const expert = await this.expertRepo.findOne({ where: { userId } });
      if (expert && treatment.expertId === expert.id) {
        createdByExpertId = expert.id;
      }
    }

    const event = await this.eventRepo.save(
      this.eventRepo.create({
        treatmentId,
        type: dto.type,
        title: dto.title.trim(),
        note: dto.note?.trim() || null,
        photoUrl: dto.photoUrl?.trim() || null,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        createdByExpertId,
      }),
    );

    return this.toEventDto(event);
  }

  async updateEventPhoto(
    userId: string,
    roles: { isExpert: boolean; isCustomer: boolean },
    treatmentId: string,
    eventId: string,
    photoUrl: string,
  ): Promise<TreatmentEventResponseDto> {
    const treatment = await this.loadTreatment(treatmentId);
    await this.assertCanMutateEvents(userId, treatment, roles);

    const event = await this.eventRepo.findOne({
      where: { id: eventId, treatmentId },
    });
    if (!event) {
      throw new NotFoundException(`Treatment event ${eventId} not found`);
    }
    if (event.type !== TreatmentEventType.PROGRESS_PHOTO) {
      throw new BadRequestException(
        'photoUrl can only be updated on PROGRESS_PHOTO events',
      );
    }

    event.photoUrl = photoUrl.trim();
    const saved = await this.eventRepo.save(event);
    return this.toEventDto(saved);
  }

  async listEvents(
    userId: string,
    roles: { isExpert: boolean; isCustomer: boolean },
    treatmentId: string,
    type?: TreatmentEventType,
  ): Promise<TreatmentEventResponseDto[]> {
    const treatment = await this.loadTreatment(treatmentId);
    await this.assertCanView(userId, treatment, roles);

    const events = await this.eventRepo.find({
      where: type ? { treatmentId, type } : { treatmentId },
      order: { occurredAt: 'ASC' },
    });
    return events.map((e) => this.toEventDto(e));
  }

  async getChart(
    userId: string,
    roles: { isExpert: boolean; isCustomer: boolean },
    treatmentId: string,
  ): Promise<TreatmentChartResponseDto> {
    const treatment = await this.loadTreatment(treatmentId);
    await this.assertCanView(userId, treatment, roles);

    const phases = [...(treatment.phases ?? [])].sort(
      (a, b) => a.phaseOrder - b.phaseOrder,
    );
    const phaseIds = phases.map((p) => p.id);

    const progressPhotos = await this.eventRepo.find({
      where: {
        treatmentId,
        type: TreatmentEventType.PROGRESS_PHOTO,
      },
      order: { occurredAt: 'ASC' },
    });

    const productsUsed = await this.loadProductsUsed(phaseIds);

    const linkedSessions = await this.consultationRepo.find({
      where: { treatmentId },
      relations: ['feedback'],
      order: { scheduledAt: 'ASC' },
    });

    let sourceConsultation: ConsultationRequest | null = null;
    if (treatment.sourceConsultationId) {
      sourceConsultation = await this.consultationRepo.findOne({
        where: { id: treatment.sourceConsultationId },
        relations: ['feedback'],
      });
    }

    const inPersonSessions = linkedSessions.map((s) =>
      this.toChartSessionDto(s),
    );
    const followUpSessions = linkedSessions
      .filter((s) => s.status === ConsultationStatus.COMPLETED)
      .map((s) => this.toChartSessionDto(s));

    const consultationResults: TreatmentChartConsultationResultDto = {
      sourceConsultation: sourceConsultation
        ? this.toChartSessionDto(sourceConsultation)
        : null,
      followUpSessions,
    };

    return {
      treatmentId: treatment.id,
      title: treatment.title,
      status: treatment.status,
      startDate: this.formatDate(treatment.startDate),
      endDate: this.formatDate(treatment.endDate),
      submittedAt: treatment.submittedAt,
      paidAt: treatment.paidAt,
      phases: phases.map((p) => ({
        id: p.id,
        phaseType: p.phaseType,
        phaseOrder: p.phaseOrder,
        title: p.title,
        status: p.status,
        noteByExpert: p.noteByExpert,
        startDate: this.formatDate(p.startDate),
        endDate: this.formatDate(p.endDate),
      })),
      progressPhotos: progressPhotos.map((e) => this.toEventDto(e)),
      productsUsed,
      inPersonSessions,
      consultationResults,
      phaseDetails: phases.map((p) => this.toPhaseDto(p)),
    };
  }

  private periodsFromTimeOfUse(timeOfUse: TimeOfUse | null): RoutinePeriod[] {
    switch (timeOfUse) {
      case TimeOfUse.AM:
        return [RoutinePeriod.MORNING];
      case TimeOfUse.PM:
        return [RoutinePeriod.EVENING];
      case TimeOfUse.AM_PM:
        return [RoutinePeriod.MORNING, RoutinePeriod.EVENING];
      default:
        return [RoutinePeriod.EVENING];
    }
  }

  private async sumStock(variantId: string): Promise<number> {
    const row = await this.stockBatchRepo
      .createQueryBuilder('b')
      .select('COALESCE(SUM(b.remainingQuantity), 0)', 'qty')
      .where('b.productVariantId = :variantId', { variantId })
      .getRawOne<{ qty: string }>();
    return Number(row?.qty ?? 0);
  }

  private async resolveCancelActor(
    userId: string,
    roles: { isExpert: boolean; isCustomer: boolean },
    treatment: Treatment,
  ): Promise<TreatmentCancelledBy> {
    if (roles.isExpert) {
      const expert = await this.expertRepo.findOne({ where: { userId } });
      if (expert && treatment.expertId === expert.id) {
        return TreatmentCancelledBy.EXPERT;
      }
    }
    if (roles.isCustomer) {
      const customer = await this.customerRepo.findOne({ where: { userId } });
      if (customer && treatment.customerId === customer.id) {
        return TreatmentCancelledBy.CUSTOMER;
      }
    }
    throw new ForbiddenException(
      'You do not have access to cancel this treatment',
    );
  }

  private async loadProductsUsed(
    phaseIds: string[],
  ): Promise<TreatmentChartProductUsedDto[]> {
    if (phaseIds.length === 0) return [];

    const completions = await this.completionRepo.find({
      where: {
        status: StepCompletionStatus.COMPLETED,
        routine: { treatmentPhaseId: In(phaseIds) },
      },
      relations: [
        'routine',
        'routineStep',
        'routineStep.details',
        'routineStep.details.productVariant',
        'routineStep.details.productVariant.product',
      ],
    });

    const byVariant = new Map<
      string,
      {
        productVariantId: string;
        productName: string | null;
        sku: string | null;
        completedCount: number;
        lastUsedAt: Date | null;
        phaseIds: Set<string>;
      }
    >();

    for (const completion of completions) {
      const phaseId = completion.routine?.treatmentPhaseId;
      if (!phaseId) continue;
      const details = completion.routineStep?.details ?? [];
      for (const detail of details) {
        if (!detail.productVariantId) continue;
        const existing = byVariant.get(detail.productVariantId);
        const sessionDate = completion.sessionDate
          ? new Date(completion.sessionDate)
          : null;
        if (!existing) {
          byVariant.set(detail.productVariantId, {
            productVariantId: detail.productVariantId,
            productName: detail.productVariant?.product?.name ?? null,
            sku: detail.productVariant?.sku ?? null,
            completedCount: 1,
            lastUsedAt: sessionDate,
            phaseIds: new Set([phaseId]),
          });
        } else {
          existing.completedCount += 1;
          existing.phaseIds.add(phaseId);
          if (
            sessionDate &&
            (!existing.lastUsedAt || sessionDate > existing.lastUsedAt)
          ) {
            existing.lastUsedAt = sessionDate;
          }
        }
      }
    }

    return [...byVariant.values()].map((row) => ({
      productVariantId: row.productVariantId,
      productName: row.productName,
      sku: row.sku,
      completedCount: row.completedCount,
      lastUsedAt: this.formatDate(row.lastUsedAt),
      phaseIds: [...row.phaseIds],
    }));
  }

  private toChartSessionDto(
    consultation: ConsultationRequest & { feedback?: Feedback | null },
  ): TreatmentChartSessionDto {
    return {
      id: consultation.id,
      status: consultation.status,
      isFollowUp: consultation.isFollowUp ?? false,
      scheduledAt: consultation.scheduledAt,
      startedAt: consultation.startedAt,
      completedAt: consultation.completedAt,
      reason: consultation.reason,
      feedbackRating: consultation.feedback?.rating ?? null,
      feedbackComment: consultation.feedback?.comment ?? null,
    };
  }

  private toEventDto(event: TreatmentEvent): TreatmentEventResponseDto {
    return {
      id: event.id,
      treatmentId: event.treatmentId,
      type: event.type,
      title: event.title,
      note: event.note,
      photoUrl: event.photoUrl,
      occurredAt: event.occurredAt,
      createdByExpertId: event.createdByExpertId,
      createdAt: event.createdAt,
    };
  }

  private async recomputeTotalPrice(treatmentId: string): Promise<void> {
    const phases = await this.phaseRepo.find({ where: { treatmentId } });
    const total = phases.reduce(
      (sum, p) => sum + BigInt(p.priceVnd || '0'),
      0n,
    );
    await this.treatmentRepo.update(
      { id: treatmentId },
      { totalPriceVnd: String(total) },
    );
  }

  /** Clears pay lock after unpaid DRAFT phase edits; customer cannot pay until re-submit. */
  private async clearSubmissionLock(treatmentId: string): Promise<void> {
    await this.treatmentRepo.update(
      { id: treatmentId },
      { submittedAt: null, totalPriceVnd: null },
    );
  }

  private assertDraftEditable(treatment: Treatment): void {
    if (treatment.status !== TreatmentStatus.DRAFT || treatment.paidAt) {
      throw new BadRequestException(
        'Only unpaid DRAFT treatments can modify phases/pricing',
      );
    }
  }

  private assertPaidActive(treatment: Treatment): void {
    if (treatment.status !== TreatmentStatus.ACTIVE || !treatment.paidAt) {
      throw new BadRequestException(
        'Treatment must be ACTIVE and paid to configure phases',
      );
    }
  }

  private async requireExpert(userId: string): Promise<Expert> {
    const expert = await this.expertRepo.findOne({ where: { userId } });
    if (!expert) {
      throw new ForbiddenException('Expert profile required');
    }
    return expert;
  }

  private async requireExpertTreatment(
    expertUserId: string,
    treatmentId: string,
  ): Promise<{ expert: Expert; treatment: Treatment }> {
    const expert = await this.requireExpert(expertUserId);
    const treatment = await this.loadTreatment(treatmentId);
    if (treatment.expertId !== expert.id) {
      throw new ForbiddenException('You can only manage your own treatments');
    }
    return { expert, treatment };
  }

  private async assertCanView(
    userId: string,
    treatment: Treatment,
    roles: { isExpert: boolean; isCustomer: boolean },
  ): Promise<void> {
    if (roles.isExpert) {
      const expert = await this.expertRepo.findOne({ where: { userId } });
      if (expert && treatment.expertId === expert.id) return;
      if (expert) {
        const hasAcceptedBooking = await this.consultationRepo.exists({
          where: {
            expertId: expert.id,
            customerId: treatment.customerId,
            status: In([
              ConsultationStatus.CONFIRMED,
              ConsultationStatus.IN_PROGRESS,
            ]),
          },
        });
        if (hasAcceptedBooking) return;
      }
    }
    if (roles.isCustomer) {
      const customer = await this.customerRepo.findOne({ where: { userId } });
      if (customer && treatment.customerId === customer.id) return;
    }
    throw new ForbiddenException('You do not have access to this treatment');
  }

  /** Assigned expert or owning customer only — not consultation read-only viewers. */
  private async assertCanMutateEvents(
    userId: string,
    treatment: Treatment,
    roles: { isExpert: boolean; isCustomer: boolean },
  ): Promise<void> {
    if (roles.isExpert) {
      const expert = await this.expertRepo.findOne({ where: { userId } });
      if (expert && treatment.expertId === expert.id) return;
    }
    if (roles.isCustomer) {
      const customer = await this.customerRepo.findOne({ where: { userId } });
      if (customer && treatment.customerId === customer.id) return;
    }
    throw new ForbiddenException(
      'You do not have permission to modify events on this treatment',
    );
  }

  private async getTreatmentDetail(
    treatmentId: string,
  ): Promise<TreatmentResponseDto> {
    return this.toTreatmentDto(await this.loadTreatment(treatmentId));
  }

  private async loadTreatment(treatmentId: string): Promise<Treatment> {
    const treatment = await this.treatmentRepo.findOne({
      where: { id: treatmentId },
      relations: [
        'phases',
        'phases.phaseIngredients',
        'phases.phaseIngredients.ingredient',
        'phases.phaseProducts',
        'phases.phaseProducts.productVariant',
        'phases.phaseProducts.productVariant.product',
        'phases.routines',
      ],
      order: { phases: { phaseOrder: 'ASC' } },
    });
    if (!treatment) {
      throw new NotFoundException(`Treatment ${treatmentId} not found`);
    }
    return treatment;
  }

  private async loadPhase(phaseId: string): Promise<TreatmentPhase> {
    const phase = await this.phaseRepo.findOne({
      where: { id: phaseId },
      relations: [
        'treatment',
        'phaseIngredients',
        'phaseIngredients.ingredient',
        'phaseProducts',
        'phaseProducts.productVariant',
        'phaseProducts.productVariant.product',
        'routines',
      ],
    });
    if (!phase) {
      throw new NotFoundException(`Phase ${phaseId} not found`);
    }
    return phase;
  }

  private toTreatmentDto(treatment: Treatment): TreatmentResponseDto {
    const phases = [...(treatment.phases ?? [])].sort(
      (a, b) => a.phaseOrder - b.phaseOrder,
    );
    return {
      id: treatment.id,
      customerId: treatment.customerId,
      expertId: treatment.expertId,
      clinicId: treatment.clinicId,
      title: treatment.title,
      description: treatment.description,
      status: treatment.status,
      startDate: this.formatDate(treatment.startDate),
      endDate: this.formatDate(treatment.endDate),
      totalPriceVnd: treatment.totalPriceVnd,
      submittedAt: treatment.submittedAt,
      paidAt: treatment.paidAt,
      paidTransactionId: treatment.paidTransactionId,
      sourceConsultationId: treatment.sourceConsultationId,
      cancelledAt: treatment.cancelledAt,
      cancelReason: treatment.cancelReason,
      cancelledBy: treatment.cancelledBy,
      refundTransactionId: treatment.refundTransactionId,
      refundedAmountVnd: treatment.refundedAmountVnd,
      phases: phases.map((p) => this.toPhaseDto(p)),
      createdAt: treatment.createdAt,
      updatedAt: treatment.updatedAt,
    };
  }

  private toPhaseDto(phase: TreatmentPhase): TreatmentPhaseResponseDto {
    return {
      id: phase.id,
      treatmentId: phase.treatmentId,
      phaseType: phase.phaseType,
      phaseOrder: phase.phaseOrder,
      title: phase.title,
      goals: phase.goals,
      notes: phase.notes,
      noteByExpert: phase.noteByExpert,
      priceVnd: phase.priceVnd,
      status: phase.status,
      startDate: this.formatDate(phase.startDate),
      endDate: this.formatDate(phase.endDate),
      ingredients: (phase.phaseIngredients ?? []).map((row) => ({
        id: row.id,
        ingredientId: row.ingredientId,
        ingredientName: row.ingredient?.name ?? null,
      })),
      products: (phase.phaseProducts ?? []).map((row) => ({
        id: row.id,
        productVariantId: row.productVariantId,
        matchScore: row.matchScore,
        productName: row.productVariant?.product?.name ?? null,
        sku: row.productVariant?.sku ?? null,
        priceVnd: row.productVariant?.priceVnd ?? null,
      })),
      routines: (phase.routines ?? []).map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        type: r.type,
      })),
    };
  }

  private formatDate(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value.slice(0, 10);
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
