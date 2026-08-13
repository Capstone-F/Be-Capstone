import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ConsultationRequest } from '../consultations/consultation-request.entity';
import { ConsultationStatus } from '../consultations/enums';
import { CustomerSurvey } from '../survey/customer-survey.entity';
import { Label } from '../survey/label.entity';
import { LabelCategory } from '../survey/label-category.entity';
import { TreatmentPhaseStatus, TreatmentStatus } from '../treatments/enums';
import { Treatment } from '../treatments/treatment.entity';
import { CustomerAllergy } from '../users/customer-allergy.entity';
import { Customer } from '../users/customer.entity';
import { CustomerSkinTypeDetails } from '../users/customer-skin-type-details.entity';
import { Expert } from '../users/expert.entity';
import { SkinType } from '../users/skin-type.entity';
import {
  AllergyLabelDto,
  BaumannScoresDto,
  CustomerDetailsDto,
  CustomerProfileResponseDto,
  SurveyAnswerDto,
  SurveyHistoryItemDto,
  TreatmentHistoryItemDto,
} from './dto/customer-profile-response.dto';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';
import { UpdateCustomerSkinTypeDto } from './dto/update-customer-skin-type.dto';

const ALLERGY_CATEGORY_CODE = 'ALLERGY';

const CONSULTATION_CONTEXT_STATUSES = [
  ConsultationStatus.CONFIRMED,
  ConsultationStatus.IN_PROGRESS,
  ConsultationStatus.COMPLETED,
  ConsultationStatus.CANCELLED,
] as const;

const TREATMENT_HISTORY_STATUSES = [
  TreatmentStatus.ACTIVE,
  TreatmentStatus.PAUSED,
  TreatmentStatus.COMPLETED,
  TreatmentStatus.CANCELLED,
];

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(CustomerAllergy)
    private readonly customerAllergyRepository: Repository<CustomerAllergy>,
    @InjectRepository(CustomerSurvey)
    private readonly customerSurveyRepository: Repository<CustomerSurvey>,
    @InjectRepository(Label)
    private readonly labelRepository: Repository<Label>,
    @InjectRepository(LabelCategory)
    private readonly labelCategoryRepository: Repository<LabelCategory>,
    @InjectRepository(Expert)
    private readonly expertRepository: Repository<Expert>,
    @InjectRepository(ConsultationRequest)
    private readonly consultationRepository: Repository<ConsultationRequest>,
    @InjectRepository(Treatment)
    private readonly treatmentRepository: Repository<Treatment>,
    @InjectRepository(SkinType)
    private readonly skinTypeRepository: Repository<SkinType>,
    @InjectRepository(CustomerSkinTypeDetails)
    private readonly customerSkinTypeDetailsRepository: Repository<CustomerSkinTypeDetails>,
    private readonly dataSource: DataSource,
  ) {}

  async getOwnCustomerProfile(
    userId: string,
  ): Promise<CustomerProfileResponseDto> {
    const customer = await this.customerRepository.findOne({
      where: { userId },
      relations: ['skinTypeDetails', 'skinTypeDetails.skinType'],
    });

    if (!customer) {
      return {
        customer: null,
        allergies: [],
        surveyHistory: [],
        treatmentHistory: [],
      };
    }

    const [allergies, surveyHistory] = await Promise.all([
      this.loadAllergies(customer.id),
      this.loadSurveyHistory(customer.id),
    ]);

    return {
      customer: this.toCustomerDto(customer),
      allergies,
      surveyHistory,
      treatmentHistory: [],
    };
  }

  /**
   * Expert prep context: profile + surveys + treatment history summaries.
   * Requires an accepted booking (CONFIRMED / IN_PROGRESS) assigned to this expert.
   */
  async getConsultationContext(
    expertUserId: string,
    customerId: string,
    consultationId: string,
  ): Promise<CustomerProfileResponseDto> {
    const expert = await this.expertRepository.findOne({
      where: { userId: expertUserId },
    });
    if (!expert) {
      throw new ForbiddenException('Yêu cầu hồ sơ chuyên gia');
    }

    const consultation = await this.consultationRepository.findOne({
      where: { id: consultationId },
    });
    if (!consultation) {
      throw new NotFoundException(
        `Không tìm thấy buổi tư vấn ${consultationId}`,
      );
    }
    if (consultation.expertId !== expert.id) {
      throw new ForbiddenException(
        'Buổi tư vấn không được gán cho chuyên gia hiện tại',
      );
    }
    if (consultation.customerId !== customerId) {
      throw new ForbiddenException(
        'Khách hàng của buổi tư vấn không khớp với khách hàng được yêu cầu',
      );
    }
    if (
      !CONSULTATION_CONTEXT_STATUSES.includes(
        consultation.status as (typeof CONSULTATION_CONTEXT_STATUSES)[number],
      )
    ) {
      throw new ForbiddenException(
        'Buổi tư vấn phải ở trạng thái CONFIRMED, IN_PROGRESS, COMPLETED hoặc CANCELLED',
      );
    }

    const customer = await this.customerRepository.findOne({
      where: { id: customerId },
      relations: ['skinTypeDetails', 'skinTypeDetails.skinType', 'user'],
    });
    if (!customer) {
      throw new NotFoundException(`Không tìm thấy khách hàng ${customerId}`);
    }

    const [allergies, surveyHistory, treatmentHistory] = await Promise.all([
      this.loadAllergies(customer.id),
      this.loadSurveyHistory(customer.id),
      this.loadTreatmentHistory(customer.id),
    ]);

    return {
      customer: this.toCustomerDto(customer),
      allergies,
      surveyHistory,
      treatmentHistory,
    };
  }

  async getAllergyOptions(): Promise<AllergyLabelDto[]> {
    const labels = await this.labelRepository.find({
      where: {
        category: { code: ALLERGY_CATEGORY_CODE },
        isActive: true,
      },
      order: { name: 'ASC' },
    });

    return labels.map((label) => ({
      id: label.id,
      code: label.code,
      name: label.name,
    }));
  }

  async updateOwnCustomerProfile(
    userId: string,
    dto: UpdateCustomerProfileDto,
  ): Promise<CustomerProfileResponseDto> {
    const hasCustomerFields =
      dto.phone !== undefined ||
      dto.avatarUrl !== undefined ||
      dto.dateOfBirth !== undefined ||
      dto.gender !== undefined;
    const hasAllergyUpdate = dto.allergyLabelCodes !== undefined;

    if (!hasCustomerFields && !hasAllergyUpdate) {
      throw new BadRequestException('Phải cung cấp ít nhất một trường');
    }

    if (dto.dateOfBirth !== undefined) {
      const dob = new Date(dto.dateOfBirth);
      if (dob > new Date()) {
        throw new BadRequestException('dateOfBirth không được ở tương lai');
      }
    }

    let customer = await this.customerRepository.findOne({
      where: { userId },
    });

    if (!customer) {
      customer = await this.getOrCreateCustomerByUserId(userId);
    }

    if (hasCustomerFields) {
      if (dto.phone !== undefined) {
        customer.phone = dto.phone.trim();
      }
      if (dto.avatarUrl !== undefined) {
        customer.avatarUrl = dto.avatarUrl.trim();
      }
      if (dto.dateOfBirth !== undefined) {
        customer.dateOfBirth = new Date(dto.dateOfBirth);
      }
      if (dto.gender !== undefined) {
        customer.gender = dto.gender;
      }
      await this.customerRepository.save(customer);
    }

    if (hasAllergyUpdate) {
      await this.replaceAllergies(customer.id, dto.allergyLabelCodes ?? []);
    }

    return this.getOwnCustomerProfile(userId);
  }

  async updateOwnSkinType(
    userId: string,
    dto: UpdateCustomerSkinTypeDto,
  ): Promise<CustomerProfileResponseDto> {
    const code = dto.skinTypeCode.trim().toUpperCase();
    const skinType = await this.skinTypeRepository.findOne({
      where: { code },
    });
    if (!skinType) {
      throw new BadRequestException(
        `Mã loại da Baumann không xác định: ${code}`,
      );
    }

    const customer = await this.getOrCreateCustomerByUserId(userId);

    let details = await this.customerSkinTypeDetailsRepository.findOne({
      where: { customerId: customer.id },
    });
    if (!details) {
      details = this.customerSkinTypeDetailsRepository.create({
        customerId: customer.id,
      });
    }

    details.skinTypeId = skinType.id;
    details.skinType = skinType;
    details.oilyDryScore = dto.oilyDryScore ?? null;
    details.sensitiveResistantScore = dto.sensitiveResistantScore ?? null;
    details.pigmentedNonPigmentedScore = dto.pigmentedNonPigmentedScore ?? null;
    details.wrinkledTightScore = dto.wrinkledTightScore ?? null;
    details.assessedAt = new Date();

    await this.customerSkinTypeDetailsRepository.save(details);

    return this.getOwnCustomerProfile(userId);
  }

  private async getOrCreateCustomerByUserId(userId: string): Promise<Customer> {
    const existing = await this.customerRepository.findOne({
      where: { userId },
    });
    if (existing) {
      return existing;
    }

    const created = this.customerRepository.create({ userId });
    return this.customerRepository.save(created);
  }

  private async loadAllergies(customerId: string): Promise<AllergyLabelDto[]> {
    const rows = await this.customerAllergyRepository.find({
      where: { customerId },
      relations: ['label'],
      order: { createdAt: 'ASC' },
    });

    return rows.map((row) => ({
      id: row.label.id,
      code: row.label.code,
      name: row.label.name,
    }));
  }

  private async loadSurveyHistory(
    customerId: string,
  ): Promise<SurveyHistoryItemDto[]> {
    const surveys = await this.customerSurveyRepository.find({
      where: { customerId },
      relations: [
        'answers',
        'answers.question',
        'answers.answerLabels',
        'answers.answerLabels.label',
      ],
      order: { createdAt: 'DESC' },
    });

    return surveys.map((survey) => ({
      id: survey.id,
      isCompleted: survey.isCompleted,
      completedAt: survey.completedAt,
      createdAt: survey.createdAt,
      answers: (survey.answers ?? []).map((answer): SurveyAnswerDto => ({
        questionCode: answer.question?.code ?? '',
        questionText: answer.question?.text ?? '',
        value: answer.value,
        labels: (answer.answerLabels ?? [])
          .map((al) => al.label)
          .filter((label): label is Label => label != null)
          .map((label) => ({
            code: label.code,
            name: label.name,
          })),
      })),
    }));
  }

  private async loadTreatmentHistory(
    customerId: string,
  ): Promise<TreatmentHistoryItemDto[]> {
    const treatments = await this.treatmentRepository.find({
      where: {
        customerId,
        status: In(TREATMENT_HISTORY_STATUSES),
      },
      relations: ['phases', 'expert', 'expert.user', 'clinic'],
      order: { updatedAt: 'DESC' },
    });

    return treatments.map((treatment) =>
      this.toTreatmentHistoryItem(treatment),
    );
  }

  private toTreatmentHistoryItem(
    treatment: Treatment,
  ): TreatmentHistoryItemDto {
    const phases = [...(treatment.phases ?? [])].sort(
      (a, b) => a.phaseOrder - b.phaseOrder,
    );
    const activePhase =
      phases.find((p) => p.status === TreatmentPhaseStatus.ACTIVE) ?? null;

    return {
      treatmentId: treatment.id,
      title: treatment.title,
      status: treatment.status,
      startDate: treatment.startDate,
      endDate: treatment.endDate,
      expert: {
        id: treatment.expertId,
        name: treatment.expert?.user?.name ?? null,
      },
      clinic: treatment.clinic
        ? { id: treatment.clinic.id, name: treatment.clinic.name }
        : null,
      currentPhase: activePhase
        ? {
            id: activePhase.id,
            phaseOrder: activePhase.phaseOrder,
            title: activePhase.title,
            status: activePhase.status,
            noteByExpert: activePhase.noteByExpert,
          }
        : null,
      phaseCount: phases.length,
      createdAt: treatment.createdAt,
      updatedAt: treatment.updatedAt,
    };
  }

  private toCustomerDto(customer: Customer): CustomerDetailsDto {
    const skinType = customer.skinTypeDetails?.skinType ?? null;
    const details = customer.skinTypeDetails;

    let baumannScores: BaumannScoresDto | null = null;
    if (details) {
      baumannScores = {
        oilyDryScore: details.oilyDryScore,
        sensitiveResistantScore: details.sensitiveResistantScore,
        pigmentedNonPigmentedScore: details.pigmentedNonPigmentedScore,
        wrinkledTightScore: details.wrinkledTightScore,
        assessedAt: details.assessedAt,
      };
    }

    return {
      id: customer.id,
      phone: customer.phone,
      avatarUrl: customer.avatarUrl,
      dateOfBirth: customer.dateOfBirth
        ? this.formatDateOnly(customer.dateOfBirth)
        : null,
      gender: customer.gender,
      skinType: skinType
        ? {
            code: skinType.code,
            name: skinType.name,
            description: skinType.description ?? null,
          }
        : null,
      baumannScores,
    };
  }

  private formatDateOnly(date: Date): string {
    const value = new Date(date);
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private async replaceAllergies(
    customerId: string,
    codes: string[],
  ): Promise<void> {
    const uniqueCodes = [...new Set(codes.map((code) => code.trim()))].filter(
      Boolean,
    );

    const allergyCategory = await this.labelCategoryRepository.findOneBy({
      code: ALLERGY_CATEGORY_CODE,
    });
    if (!allergyCategory) {
      throw new BadRequestException('Danh mục nhãn ALLERGY chưa được cấu hình');
    }

    let allergyLabels: Label[] = [];
    if (uniqueCodes.length > 0) {
      allergyLabels = await this.labelRepository.find({
        where: {
          code: In(uniqueCodes),
          isActive: true,
          categoryId: allergyCategory.id,
        },
      });

      if (allergyLabels.length !== uniqueCodes.length) {
        const foundCodes = new Set(allergyLabels.map((label) => label.code));
        const invalid = uniqueCodes.filter((code) => !foundCodes.has(code));
        throw new BadRequestException(
          `Mã nhãn dị ứng không hợp lệ: ${invalid.join(', ')}`,
        );
      }
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(CustomerAllergy, { customerId });
      if (allergyLabels.length > 0) {
        const rows = allergyLabels.map((label) =>
          manager.create(CustomerAllergy, {
            customerId,
            labelId: label.id,
          }),
        );
        await manager.save(CustomerAllergy, rows);
      }
    });
  }
}
