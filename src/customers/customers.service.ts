import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { CustomerSurvey } from '../survey/customer-survey.entity';
import { Label } from '../survey/label.entity';
import { LabelCategory } from '../survey/label-category.entity';
import { CustomerAllergy } from '../users/customer-allergy.entity';
import { Customer } from '../users/customer.entity';
import {
  AllergyLabelDto,
  BaumannScoresDto,
  CustomerDetailsDto,
  CustomerProfileResponseDto,
  SurveyAnswerDto,
  SurveyHistoryItemDto,
} from './dto/customer-profile-response.dto';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';

const ALLERGY_CATEGORY_CODE = 'ALLERGY';

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
      throw new BadRequestException('At least one field must be provided');
    }

    if (dto.dateOfBirth !== undefined) {
      const dob = new Date(dto.dateOfBirth);
      if (dob > new Date()) {
        throw new BadRequestException('dateOfBirth must not be in the future');
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
      answers: (survey.answers ?? []).map(
        (answer): SurveyAnswerDto => ({
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
        }),
      ),
    }));
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
      throw new BadRequestException('ALLERGY label category is not configured');
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
          `Invalid allergy label codes: ${invalid.join(', ')}`,
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
