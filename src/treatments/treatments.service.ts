import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { LedgerAccount, TransactionType } from '../commerce/enums';
import { ConsultationRequest } from '../consultations/consultation-request.entity';
import { Feedback } from '../consultations/feedback.entity';
import { ConsultationStatus } from '../consultations/enums';
import {
  EscrowService,
  EscrowTreatmentSummary,
} from '../finance/escrow.service';
import { IngredientConflict } from '../ingredients/ingredient-conflict.entity';
import { Ingredient } from '../ingredients/ingredient.entity';
import { TimeOfUse } from '../ingredients/enums';
import { ProductIngredient } from '../products/product-ingredient.entity';
import { ProductProtocol } from '../products/product-protocol.entity';
import { ProductVariant } from '../products/product-variant.entity';
import { buildIlikePattern } from '../products/utils/ilike.util';
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
  DateSortOrder,
  ListMyTreatmentsQueryDto,
} from './dto/list-my-treatments.dto';
import { ListClinicTreatmentsQueryDto } from './dto/list-clinic-treatments-query.dto';
import {
  ClinicTreatmentResponseDto,
  PaginatedClinicTreatmentsDto,
} from './dto/clinic-treatment-response.dto';
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
  CandidateConflictWarningDto,
  ProductCandidateDto,
  TreatmentPhaseResponseDto,
  TreatmentProductConflictDto,
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
    private readonly escrowService: EscrowService,
    private readonly dataSource: DataSource,
    @InjectRepository(IngredientConflict)
    private readonly ingredientConflictRepo: Repository<IngredientConflict>,
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
        throw new NotFoundException(
          `Không tìm thấy khách hàng ${dto.customerId}`,
        );
      }
    }

    if (dto.sourceConsultationId) {
      const consultation = await this.consultationRepo.findOne({
        where: { id: dto.sourceConsultationId },
      });
      if (!consultation) {
        throw new NotFoundException('Không tìm thấy buổi tư vấn nguồn');
      }
      if (
        consultation.expertId !== expert.id ||
        consultation.customerId !== customer.id
      ) {
        throw new BadRequestException(
          'Buổi tư vấn nguồn không khớp với chuyên gia/khách hàng',
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
          `Buổi tư vấn nguồn phải ở trạng thái IN_PROGRESS hoặc COMPLETED (hiện tại: ${consultation.status})`,
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
    query: ListMyTreatmentsQueryDto = {},
  ): Promise<TreatmentResponseDto[]> {
    if (asExpert) {
      return this.listExpertTreatments(userId, query);
    }

    const customer = await this.customerRepo.findOne({ where: { userId } });
    if (!customer) return [];
    const rows = await this.treatmentRepo.find({
      where: { customerId: customer.id, submittedAt: Not(IsNull()) },
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

  private async listExpertTreatments(
    userId: string,
    query: ListMyTreatmentsQueryDto,
  ): Promise<TreatmentResponseDto[]> {
    const expert = await this.requireExpert(userId);
    const dateOrder = query.dateOrder === DateSortOrder.ASC ? 'ASC' : 'DESC';

    const idQb = this.treatmentRepo
      .createQueryBuilder('treatment')
      .select('treatment.id', 'id')
      .where('treatment.expertId = :expertId', { expertId: expert.id });

    const searchTerm = buildIlikePattern(query.search ?? '');
    if (searchTerm) {
      idQb
        .leftJoin('treatment.customer', 'customer')
        .leftJoin('customer.user', 'customerUser')
        .andWhere(
          new Brackets((sub) => {
            sub
              .where(`treatment.title ILIKE :searchTerm ESCAPE '\\'`)
              .orWhere(`treatment.description ILIKE :searchTerm ESCAPE '\\'`)
              .orWhere(`customerUser.name ILIKE :searchTerm ESCAPE '\\'`)
              .orWhere(`customerUser.email ILIKE :searchTerm ESCAPE '\\'`);
          }),
          { searchTerm },
        );
    }

    if (query.phaseCount !== undefined) {
      idQb.andWhere(
        `(SELECT COUNT(*)::int FROM treatment_phases p WHERE p."treatmentId" = treatment.id) = :phaseCount`,
        { phaseCount: query.phaseCount },
      );
    }

    idQb.orderBy('treatment.createdAt', dateOrder);

    const rawIds = await idQb.getRawMany<{ id: string }>();
    const ids = rawIds.map((row) => row.id);
    if (ids.length === 0) {
      return [];
    }

    const rows = await this.treatmentRepo.find({
      where: { id: In(ids) },
      relations: [
        'phases',
        'phases.phaseIngredients',
        'phases.phaseIngredients.ingredient',
        'phases.phaseProducts',
        'phases.phaseProducts.productVariant',
        'phases.routines',
      ],
    });

    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids
      .map((id) => byId.get(id))
      .filter((row): row is Treatment => row != null)
      .map((row) => this.toTreatmentDto(row));
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

  /**
   * List treatment plans in a clinic (clinic manager oversight). Scoped by
   * {@link Treatment.clinicId} (set to the expert's clinic at creation).
   * Only submitted plans are shown (drafts still being edited are excluded).
   * Each row carries an escrow summary so managers can track released funds.
   */
  async listByClinic(
    clinicId: string,
    query: ListClinicTreatmentsQueryDto = {},
  ): Promise<PaginatedClinicTreatmentsDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.treatmentRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.phases', 'phases')
      .leftJoinAndSelect('phases.phaseIngredients', 'phaseIngredients')
      .leftJoinAndSelect('phaseIngredients.ingredient', 'ingredient')
      .leftJoinAndSelect('phases.phaseProducts', 'phaseProducts')
      .leftJoinAndSelect('phaseProducts.productVariant', 'productVariant')
      .leftJoinAndSelect('phases.routines', 'routines')
      .leftJoinAndSelect('t.expert', 'expert')
      .leftJoinAndSelect('expert.user', 'expertUser')
      .leftJoinAndSelect('t.customer', 'customer')
      .leftJoinAndSelect('customer.user', 'customerUser')
      .where('t.clinicId = :clinicId', { clinicId })
      .andWhere('t.submittedAt IS NOT NULL');

    if (query.status) {
      qb.andWhere('t.status = :status', { status: query.status });
    }
    if (query.expertId) {
      qb.andWhere('t.expertId = :expertId', { expertId: query.expertId });
    }

    const searchTerm = query.search?.trim() || query.q?.trim();
    if (searchTerm) {
      const searchPattern = `%${searchTerm.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(t.title) LIKE :searchPattern OR LOWER(customerUser.name) LIKE :searchPattern OR LOWER(expertUser.name) LIKE :searchPattern)',
        { searchPattern },
      );
    }

    qb.orderBy('t.createdAt', 'DESC').skip(skip).take(limit);

    const [rows, total] = await qb.getManyAndCount();

    const escrowMap = await this.escrowService.summarizeByTreatmentIds(
      rows.map((t) => t.id),
    );

    const items = rows.map((t) => this.toClinicTreatmentDto(t, escrowMap));
    return { items, total, page, limit };
  }

  /** Single treatment detail for a clinic manager, scoped to their clinic. */
  async getByClinic(
    clinicId: string,
    treatmentId: string,
  ): Promise<ClinicTreatmentResponseDto> {
    const treatment = await this.loadTreatment(treatmentId);
    if (treatment.clinicId !== clinicId) {
      throw new ForbiddenException(
        'Liệu trình này không thuộc phòng khám của bạn',
      );
    }
    const escrowMap = await this.escrowService.summarizeByTreatmentIds([
      treatment.id,
    ]);
    return this.toClinicTreatmentDto(treatment, escrowMap);
  }

  private toClinicTreatmentDto(
    treatment: Treatment,
    escrowMap: Map<string, EscrowTreatmentSummary>,
  ): ClinicTreatmentResponseDto {
    const summary = escrowMap.get(treatment.id) ?? {
      heldVnd: '0',
      releasedVnd: '0',
      refundedVnd: '0',
    };
    return {
      ...this.toTreatmentDto(treatment),
      escrow: {
        heldVnd: summary.heldVnd,
        releasedVnd: summary.releasedVnd,
        refundedVnd: summary.refundedVnd,
      },
    };
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
      throw new BadRequestException('Liệu trình phải có ít nhất một giai đoạn');
    }

    const missingNote = phases.find((p) => !p.noteByExpert?.trim());
    if (missingNote) {
      throw new BadRequestException(
        'Mỗi giai đoạn cần noteByExpert trước khi gửi (lý do giai đoạn/kế hoạch này được tạo)',
      );
    }

    const total = phases.reduce(
      (sum, p) => sum + BigInt(p.priceVnd || '0'),
      0n,
    );
    if (total <= 0n) {
      throw new BadRequestException('Tổng giá kế hoạch phải lớn hơn 0');
    }

    if (!treatment.startDate || !treatment.endDate) {
      throw new BadRequestException(
        'startDate và endDate của liệu trình là bắt buộc trước khi thanh toán',
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
      throw new ForbiddenException(
        'Chỉ khách hàng sở hữu mới có thể thanh toán',
      );
    }
    if (treatment.status !== TreatmentStatus.DRAFT) {
      throw new BadRequestException(
        `Liệu trình không thể thanh toán (trạng thái: ${treatment.status})`,
      );
    }
    if (treatment.paidAt) {
      throw new BadRequestException('Liệu trình đã được thanh toán');
    }
    if (!treatment.submittedAt) {
      throw new BadRequestException(
        'Kế hoạch liệu trình chưa được chuyên gia gửi',
      );
    }

    await this.recomputeTotalPrice(treatmentId);
    const reloaded = await this.loadTreatment(treatmentId);
    const total = Number(reloaded.totalPriceVnd ?? 0);
    if (!reloaded.phases?.length || total <= 0) {
      throw new BadRequestException(
        'Liệu trình không có giai đoạn nào để thanh toán (chuyên gia phải gửi kế hoạch trước)',
      );
    }
    if (!reloaded.startDate || !reloaded.endDate) {
      throw new BadRequestException(
        'startDate và endDate của liệu trình là bắt buộc',
      );
    }
    if (!reloaded.clinicId) {
      throw new BadRequestException(
        'Liệu trình chưa được gán vào phòng khám nào',
      );
    }

    const payablePhases = reloaded.phases.filter(
      (p) => Number(p.priceVnd || '0') > 0,
    );
    if (!payablePhases.length) {
      throw new BadRequestException(
        'Liệu trình không có giai đoạn nào để thanh toán (chuyên gia phải gửi kế hoạch trước)',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const tx = await this.walletService.debitWithManager(manager, {
        type: TransactionType.TREATMENT_PLAN_PAYMENT,
        amountVnd: total,
        userId: customerUserId,
        treatmentId: reloaded.id,
        clinicId: reloaded.clinicId,
        expertId: reloaded.expertId,
        fromAccount: LedgerAccount.CUSTOMER_WALLET,
        toAccount: LedgerAccount.PLATFORM_ESCROW,
        externalRef: `treatment-pay:${reloaded.id}`,
        note: `Treatment plan payment ${reloaded.id}`,
      });

      for (const phase of payablePhases) {
        await this.escrowService.holdTreatmentPhaseWithManager(manager, {
          treatmentId: reloaded.id,
          treatmentPhaseId: phase.id,
          clinicId: reloaded.clinicId!,
          expertId: reloaded.expertId,
          customerUserId,
          amountVnd: phase.priceVnd,
          holdTransactionId: tx.id,
        });
      }

      reloaded.paidAt = new Date();
      reloaded.paidTransactionId = tx.id;
      reloaded.status = TreatmentStatus.ACTIVE;
      reloaded.totalPriceVnd = String(total);
      await manager.save(Treatment, reloaded);
    });

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
        throw new BadRequestException(
          'Một hoặc nhiều ingredientIds không hợp lệ',
        );
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
        conflictWarnings: [],
      });
    }

    results.sort(
      (a, b) =>
        b.matchScore - a.matchScore ||
        a.priceVnd - b.priceVnd ||
        a.sku.localeCompare(b.sku),
    );
    await this.attachConflictWarnings(
      results,
      (phase.phaseProducts ?? []).map((r) => r.productVariantId),
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
          'Một hoặc nhiều productVariantIds không hợp lệ',
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

    const phaseDto = this.toPhaseDto(await this.loadPhase(phaseId));
    phaseDto.conflicts = await this.resolvePhaseProductConflicts(uniqueIds);
    return phaseDto;
  }

  /**
   * Map product variants to their ingredient-protocol ids (via product_protocols),
   * mirroring the cart conflict resolution.
   */
  private async mapVariantsToProtocols(variantIds: string[]): Promise<{
    variantIdsByProtocolId: Map<string, string[]>;
    protocolIdsByVariantId: Map<string, Set<string>>;
  }> {
    const variantIdsByProtocolId = new Map<string, string[]>();
    const protocolIdsByVariantId = new Map<string, Set<string>>();
    if (variantIds.length === 0) {
      return { variantIdsByProtocolId, protocolIdsByVariantId };
    }

    const variants = await this.variantRepo.find({
      where: { id: In(variantIds) },
    });
    const variantIdsByProductId = new Map<string, string[]>();
    for (const variant of variants) {
      const list = variantIdsByProductId.get(variant.productId) ?? [];
      list.push(variant.id);
      variantIdsByProductId.set(variant.productId, list);
    }
    const productIds = [...variantIdsByProductId.keys()];
    if (productIds.length === 0) {
      return { variantIdsByProtocolId, protocolIdsByVariantId };
    }

    const mappings = await this.productProtocolRepo.find({
      where: { productId: In(productIds) },
    });
    for (const mapping of mappings) {
      const mappedVariantIds =
        variantIdsByProductId.get(mapping.productId) ?? [];
      const existing = variantIdsByProtocolId.get(mapping.protocolId) ?? [];
      for (const variantId of mappedVariantIds) {
        if (!existing.includes(variantId)) {
          existing.push(variantId);
        }
        const set = protocolIdsByVariantId.get(variantId) ?? new Set<string>();
        set.add(mapping.protocolId);
        protocolIdsByVariantId.set(variantId, set);
      }
      variantIdsByProtocolId.set(mapping.protocolId, existing);
    }
    return { variantIdsByProtocolId, protocolIdsByVariantId };
  }

  /** Conflicts among the phase's selected product variants. */
  private async resolvePhaseProductConflicts(
    variantIds: string[],
  ): Promise<TreatmentProductConflictDto[]> {
    if (variantIds.length < 2) {
      return [];
    }
    const { variantIdsByProtocolId } =
      await this.mapVariantsToProtocols(variantIds);
    const protocolIds = [...variantIdsByProtocolId.keys()];
    if (protocolIds.length === 0) {
      return [];
    }

    const conflicts = await this.ingredientConflictRepo.find({
      where: {
        protocolId: In(protocolIds),
        conflictingProtocolId: In(protocolIds),
      },
      relations: ['protocol', 'conflictingProtocol'],
    });

    const resolved: TreatmentProductConflictDto[] = [];
    for (const conflict of conflicts) {
      const productVariantIds =
        variantIdsByProtocolId.get(conflict.protocolId) ?? [];
      const conflictingProductVariantIds =
        variantIdsByProtocolId.get(conflict.conflictingProtocolId) ?? [];
      if (
        productVariantIds.length === 0 ||
        conflictingProductVariantIds.length === 0
      ) {
        continue;
      }
      resolved.push({
        protocolCode: conflict.protocol?.code ?? conflict.protocolId,
        conflictingProtocolCode:
          conflict.conflictingProtocol?.code ?? conflict.conflictingProtocolId,
        severity: conflict.severity,
        description: conflict.description ?? conflict.reason ?? '',
        reason: conflict.reason,
        productVariantIds,
        conflictingProductVariantIds,
      });
    }
    return resolved;
  }

  /**
   * Flag candidates that conflict with products already selected in the phase,
   * so the expert is warned at selection time.
   */
  private async attachConflictWarnings(
    candidates: ProductCandidateDto[],
    selectedVariantIds: string[],
  ): Promise<void> {
    if (candidates.length === 0 || selectedVariantIds.length === 0) {
      return;
    }
    const unionIds = [
      ...new Set([
        ...candidates.map((c) => c.productVariantId),
        ...selectedVariantIds,
      ]),
    ];
    const { protocolIdsByVariantId } =
      await this.mapVariantsToProtocols(unionIds);
    const allProtocolIds = [
      ...new Set(
        [...protocolIdsByVariantId.values()].flatMap((set) => [...set]),
      ),
    ];
    if (allProtocolIds.length === 0) {
      return;
    }

    const conflicts = await this.ingredientConflictRepo.find({
      where: {
        protocolId: In(allProtocolIds),
        conflictingProtocolId: In(allProtocolIds),
      },
      relations: ['protocol', 'conflictingProtocol'],
    });
    if (conflicts.length === 0) {
      return;
    }

    for (const candidate of candidates) {
      const candidateProtocols = protocolIdsByVariantId.get(
        candidate.productVariantId,
      );
      if (!candidateProtocols || candidateProtocols.size === 0) {
        continue;
      }
      const warnings: CandidateConflictWarningDto[] = [];
      for (const selectedId of selectedVariantIds) {
        if (selectedId === candidate.productVariantId) {
          continue;
        }
        const selectedProtocols = protocolIdsByVariantId.get(selectedId);
        if (!selectedProtocols || selectedProtocols.size === 0) {
          continue;
        }
        for (const conflict of conflicts) {
          if (
            candidateProtocols.has(conflict.protocolId) &&
            selectedProtocols.has(conflict.conflictingProtocolId)
          ) {
            warnings.push({
              selectedProductVariantId: selectedId,
              protocolCode: conflict.protocol?.code ?? conflict.protocolId,
              conflictingProtocolCode:
                conflict.conflictingProtocol?.code ??
                conflict.conflictingProtocolId,
              severity: conflict.severity,
              description: conflict.description ?? conflict.reason ?? '',
            });
          } else if (
            candidateProtocols.has(conflict.conflictingProtocolId) &&
            selectedProtocols.has(conflict.protocolId)
          ) {
            warnings.push({
              selectedProductVariantId: selectedId,
              protocolCode:
                conflict.conflictingProtocol?.code ??
                conflict.conflictingProtocolId,
              conflictingProtocolCode:
                conflict.protocol?.code ?? conflict.protocolId,
              severity: conflict.severity,
              description: conflict.description ?? conflict.reason ?? '',
            });
          }
        }
      }
      candidate.conflictWarnings = warnings;
    }
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
        'Chọn sản phẩm cho giai đoạn trước khi tạo lộ trình chăm sóc',
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
      throw new NotFoundException(
        'Không tìm thấy lộ trình chăm sóc của chuyên gia',
      );
    }
    if (!routine.treatmentPhaseId) {
      throw new BadRequestException(
        'Lộ trình chăm sóc chưa được liên kết với giai đoạn liệu trình',
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
        `Không thể chỉnh sửa lộ trình chăm sóc ở trạng thái ${routine.status}`,
      );
    }

    await this.routineRepo.save(routine);

    if (dto.steps !== undefined) {
      const existingSteps = await this.stepRepo.find({
        where: { routineId },
        order: { stepOrder: 'ASC' },
      });

      const existingStepMap = new Map(existingSteps.map((s) => [s.id, s]));
      const requestedIds = new Set(
        dto.steps.map((s) => s.id).filter((id): id is string => Boolean(id)),
      );

      // 1. Delete steps that are omitted in dto.steps
      // Always use ID-based deletion when at least one step sends an id;
      // fall back to positional truncation only when NO id is sent at all.
      if (requestedIds.size > 0) {
        const stepsToDelete = existingSteps.filter(
          (s) => !requestedIds.has(s.id),
        );
        if (stepsToDelete.length > 0) {
          try {
            await this.stepRepo.remove(stepsToDelete);
          } catch (err) {
            console.error(
              `[updateRoutine] Failed to delete steps for routine ${routineId}:`,
              err,
            );
            throw err;
          }
        }
      } else if (existingSteps.length > dto.steps.length) {
        // Fallback positional deletion if frontend did not send IDs
        const toRemove = existingSteps.slice(dto.steps.length);
        try {
          await this.stepRepo.remove(toRemove);
        } catch (err) {
          console.error(
            `[updateRoutine] Failed positional-delete steps for routine ${routineId}:`,
            err,
          );
          throw err;
        }
      }

      // 2. Update existing steps or insert newly added steps
      for (let i = 0; i < dto.steps.length; i++) {
        const patch = dto.steps[i];
        const step = patch.id
          ? existingStepMap.get(patch.id)
          : i < existingSteps.length
            ? existingSteps[i]
            : undefined;

        if (step) {
          if (patch.name !== undefined) step.name = patch.name;
          if (patch.period !== undefined) {
            step.period = patch.period as RoutinePeriod;
          }
          if (patch.stepOrder !== undefined) step.stepOrder = patch.stepOrder;
          else step.stepOrder = i;
          if (patch.instructions !== undefined) {
            step.instructions = patch.instructions;
          }
          if (patch.waitMinutes !== undefined) {
            step.waitMinutes = patch.waitMinutes;
          }
          if (patch.dosageText !== undefined) {
            step.dosageText = patch.dosageText;
          }
          try {
            await this.stepRepo.save(step);
          } catch (err) {
            console.error(
              `[updateRoutine] Failed to save step ${step.id} for routine ${routineId}:`,
              err,
            );
            throw err;
          }
        } else {
          // Insert new step
          const newStep = this.stepRepo.create({
            routineId,
            name: patch.name || `Bước ${i + 1}`,
            period: (patch.period as RoutinePeriod) || RoutinePeriod.MORNING,
            stepOrder: patch.stepOrder ?? i,
            instructions: patch.instructions ?? null,
            waitMinutes: patch.waitMinutes ?? null,
            dosageText: patch.dosageText ?? null,
          });
          try {
            await this.stepRepo.save(newStep);
          } catch (err) {
            console.error(
              `[updateRoutine] Failed to insert new step for routine ${routineId}:`,
              err,
            );
            throw err;
          }
        }
      }
    }

    // Promote draft to saved state only when the expert intentionally saves
    // (i.e. steps or metadata were included in the request).
    // An empty PATCH {} is used by the FE just to fetch the latest routine state
    // without triggering a status transition.
    const hasContent =
      dto.steps !== undefined ||
      dto.title !== undefined ||
      dto.description !== undefined;
    if (hasContent && routine.status === RoutineStatus.DRAFT) {
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
      throw new NotFoundException(
        'Không tìm thấy lộ trình chăm sóc của chuyên gia',
      );
    }
    if (!routine.treatmentPhaseId) {
      throw new BadRequestException(
        'Lộ trình chăm sóc chưa được liên kết với giai đoạn liệu trình',
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
          'Lưu tất cả lộ trình chăm sóc của giai đoạn trước khi kích hoạt (các lộ trình DRAFT phải được lưu)',
        );
      }
    } else {
      // No routine allowed — require dates or notes
      if (!phase.startDate && !phase.endDate && !phase.notes) {
        throw new BadRequestException(
          'Giai đoạn không có lộ trình chăm sóc cần startDate/endDate hoặc notes',
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

        const prevActiveRoutines = await manager.find(Routine, {
          where: {
            treatmentPhaseId: other.id,
            status: RoutineStatus.ACTIVE,
          },
        });
        for (const prevRoutine of prevActiveRoutines) {
          prevRoutine.status = RoutineStatus.COMPLETED;
          await manager.save(Routine, prevRoutine);
        }
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

      // Release escrow for this phase (non-refundable once ACTIVE)
      const hold = await this.escrowService.findHeldByTreatmentPhase(
        manager,
        phaseId,
      );
      if (hold) {
        await this.escrowService.releaseWithManager(manager, hold.id);
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
        `Liệu trình chỉ có thể hủy khi ở trạng thái ACTIVE hoặc PAUSED (hiện tại: ${treatment.status})`,
      );
    }

    const pendingRefund = (treatment.phases ?? [])
      .filter((p) => p.status === TreatmentPhaseStatus.PENDING)
      .reduce((sum, p) => sum + BigInt(p.priceVnd || '0'), 0n);

    let refundTxId: string | null = null;
    let refundedAmount: string | null = null;

    await this.dataSource.transaction(async (manager) => {
      const held = await this.escrowService.findHeldByTreatment(
        manager,
        treatment.id,
      );

      let refunded = 0n;
      let lastRefundTxId: string | null = null;
      for (const hold of held) {
        const refundedHold = await this.escrowService.refundWithManager(
          manager,
          hold.id,
        );
        if (refundedHold?.refundTransactionId) {
          lastRefundTxId = refundedHold.refundTransactionId;
        }
        refunded += BigInt(hold.amountVnd);
      }

      if (pendingRefund > 0n && treatment.paidAt && held.length === 0) {
        // Legacy paid plans without escrow holds — refund PENDING phases directly
        const customer = await this.customerRepo.findOne({
          where: { id: treatment.customerId },
        });
        if (!customer?.userId) {
          throw new BadRequestException(
            'Cần người dùng ví của khách hàng để hoàn tiền',
          );
        }
        const tx = await this.walletService.creditWithManager(manager, {
          type: TransactionType.REFUND,
          amountVnd: pendingRefund.toString(),
          userId: customer.userId,
          treatmentId: treatment.id,
          clinicId: treatment.clinicId,
          expertId: treatment.expertId,
          note: `Refund PENDING phases for treatment ${treatment.id}`,
          externalRef: `treatment-refund-legacy:${treatment.id}`,
        });
        lastRefundTxId = tx.id;
        refunded = pendingRefund;
      }

      refundTxId = lastRefundTxId;
      refundedAmount = refunded > 0n ? refunded.toString() : null;

      treatment.status = TreatmentStatus.CANCELLED;
      treatment.cancelledAt = new Date();
      treatment.cancelReason = dto.reason?.trim() || null;
      treatment.cancelledBy = cancelledBy;
      treatment.refundTransactionId = refundTxId;
      treatment.refundedAmountVnd = refundedAmount;
      await manager.save(Treatment, treatment);

      const phaseIds = (treatment.phases ?? []).map((p) => p.id);
      if (phaseIds.length > 0) {
        const activeRoutines = await manager.find(Routine, {
          where: {
            treatmentPhaseId: In(phaseIds),
            status: RoutineStatus.ACTIVE,
          },
        });
        for (const routine of activeRoutines) {
          routine.status = RoutineStatus.PAUSED;
          await manager.save(Routine, routine);
        }
      }
    });

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
        'photoUrl là bắt buộc đối với sự kiện PROGRESS_PHOTO',
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
      throw new NotFoundException(
        `Không tìm thấy sự kiện liệu trình ${eventId}`,
      );
    }
    if (event.type !== TreatmentEventType.PROGRESS_PHOTO) {
      throw new BadRequestException(
        'photoUrl chỉ có thể được cập nhật trên sự kiện PROGRESS_PHOTO',
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
    throw new ForbiddenException('Bạn không có quyền hủy liệu trình này');
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
        'Chỉ liệu trình DRAFT chưa thanh toán mới có thể chỉnh sửa giai đoạn/giá',
      );
    }
  }

  private assertPaidActive(treatment: Treatment): void {
    if (treatment.status !== TreatmentStatus.ACTIVE || !treatment.paidAt) {
      throw new BadRequestException(
        'Liệu trình phải ở trạng thái ACTIVE và đã thanh toán để cấu hình giai đoạn',
      );
    }
  }

  private async requireExpert(userId: string): Promise<Expert> {
    const expert = await this.expertRepo.findOne({ where: { userId } });
    if (!expert) {
      throw new ForbiddenException('Cần hồ sơ chuyên gia');
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
      throw new ForbiddenException(
        'Bạn chỉ có thể quản lý các liệu trình của chính mình',
      );
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
      if (customer && treatment.customerId === customer.id) {
        if (
          !treatment.submittedAt &&
          treatment.status === TreatmentStatus.DRAFT
        ) {
          throw new ForbiddenException(
            'Kế hoạch liệu trình chưa được chuyên gia gửi',
          );
        }
        return;
      }
    }
    throw new ForbiddenException('Bạn không có quyền truy cập liệu trình này');
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
      'Bạn không có quyền chỉnh sửa sự kiện trên liệu trình này',
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
      throw new NotFoundException(`Không tìm thấy liệu trình ${treatmentId}`);
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
      throw new NotFoundException(`Không tìm thấy giai đoạn ${phaseId}`);
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
