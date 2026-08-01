import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
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
import { Gender } from '../users/gender.enum';
import { SkinType } from '../users/skin-type.entity';
import { CustomersService } from './customers.service';

const makeRepo = <T extends object>(overrides: Partial<Repository<T>> = {}) =>
  ({
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    exists: jest.fn(),
    ...overrides,
  }) as unknown as Repository<T>;

const makeDataSource = (transactionImpl?: jest.Mock) =>
  ({
    transaction:
      transactionImpl ??
      jest.fn((cb) =>
        cb({
          delete: jest.fn(),
          create: jest.fn((_, data) => data),
          save: jest.fn(),
        }),
      ),
  }) as unknown as DataSource;

describe('CustomersService', () => {
  let customerRepository: Repository<Customer>;
  let customerAllergyRepository: Repository<CustomerAllergy>;
  let customerSurveyRepository: Repository<CustomerSurvey>;
  let labelRepository: Repository<Label>;
  let labelCategoryRepository: Repository<LabelCategory>;
  let expertRepository: Repository<Expert>;
  let consultationRepository: Repository<ConsultationRequest>;
  let treatmentRepository: Repository<Treatment>;
  let skinTypeRepository: Repository<SkinType>;
  let customerSkinTypeDetailsRepository: Repository<CustomerSkinTypeDetails>;
  let dataSource: DataSource;
  let service: CustomersService;

  const buildService = (ds: DataSource = dataSource) =>
    new CustomersService(
      customerRepository,
      customerAllergyRepository,
      customerSurveyRepository,
      labelRepository,
      labelCategoryRepository,
      expertRepository,
      consultationRepository,
      treatmentRepository,
      skinTypeRepository,
      customerSkinTypeDetailsRepository,
      ds,
    );

  beforeEach(() => {
    customerRepository = makeRepo<Customer>();
    customerAllergyRepository = makeRepo<CustomerAllergy>();
    customerSurveyRepository = makeRepo<CustomerSurvey>();
    labelRepository = makeRepo<Label>();
    labelCategoryRepository = makeRepo<LabelCategory>();
    expertRepository = makeRepo<Expert>();
    consultationRepository = makeRepo<ConsultationRequest>();
    treatmentRepository = makeRepo<Treatment>();
    skinTypeRepository = makeRepo<SkinType>();
    customerSkinTypeDetailsRepository = makeRepo<CustomerSkinTypeDetails>();
    dataSource = makeDataSource();

    service = buildService();
  });

  afterEach(() => jest.clearAllMocks());

  describe('getAllergyOptions', () => {
    it('should return active ALLERGY labels ordered for selection', async () => {
      jest.spyOn(labelRepository, 'find').mockResolvedValue([
        {
          id: 'label-1',
          code: 'FRAGRANCE',
          name: 'Fragrance',
        },
        {
          id: 'label-2',
          code: 'RETINOIDS',
          name: 'Retinoids',
        },
      ] as Label[]);

      const result = await service.getAllergyOptions();

      expect(labelRepository.find).toHaveBeenCalledWith({
        where: {
          category: { code: 'ALLERGY' },
          isActive: true,
        },
        order: { name: 'ASC' },
      });
      expect(result).toEqual([
        { id: 'label-1', code: 'FRAGRANCE', name: 'Fragrance' },
        { id: 'label-2', code: 'RETINOIDS', name: 'Retinoids' },
      ]);
    });
  });

  describe('getOwnCustomerProfile', () => {
    it('should return empty profile when customer row does not exist', async () => {
      jest.spyOn(customerRepository, 'findOne').mockResolvedValue(null);

      const result = await service.getOwnCustomerProfile('user-1');

      expect(result).toEqual({
        customer: null,
        allergies: [],
        surveyHistory: [],
        treatmentHistory: [],
      });
    });

    it('should return customer details, allergies, and survey history', async () => {
      const customer = {
        id: 'customer-1',
        userId: 'user-1',
        phone: '+84901234567',
        avatarUrl: 'https://cdn.example.com/a.jpg',
        dateOfBirth: new Date('1995-06-15'),
        gender: Gender.FEMALE,
        skinTypeDetails: {
          oilyDryScore: 1,
          sensitiveResistantScore: 2,
          pigmentedNonPigmentedScore: 3,
          wrinkledTightScore: 4,
          assessedAt: new Date('2026-01-01'),
          skinType: { code: 'OSPW', name: 'Oily Sensitive Pigmented Wrinkled' },
        },
      } as Customer;

      jest.spyOn(customerRepository, 'findOne').mockResolvedValue(customer);
      jest.spyOn(customerAllergyRepository, 'find').mockResolvedValue([
        {
          label: { id: 'label-1', code: 'FRAGRANCE', name: 'Fragrance' },
        },
      ] as CustomerAllergy[]);
      jest.spyOn(customerSurveyRepository, 'find').mockResolvedValue([
        {
          id: 'survey-1',
          isCompleted: true,
          completedAt: new Date('2026-02-01'),
          createdAt: new Date('2026-01-15'),
          answers: [
            {
              value: 'yes',
              question: { code: 'Q1', text: 'Do you have oily skin?' },
              answerLabels: [{ label: { code: 'OILY', name: 'Oily Skin' } }],
            },
          ],
        },
      ] as CustomerSurvey[]);

      const result = await service.getOwnCustomerProfile('user-1');

      expect(result.customer).toEqual(
        expect.objectContaining({
          id: 'customer-1',
          phone: '+84901234567',
          gender: Gender.FEMALE,
          skinType: {
            code: 'OSPW',
            name: 'Oily Sensitive Pigmented Wrinkled',
            description: null,
          },
          baumannScores: {
            oilyDryScore: 1,
            sensitiveResistantScore: 2,
            pigmentedNonPigmentedScore: 3,
            wrinkledTightScore: 4,
            assessedAt: new Date('2026-01-01'),
          },
        }),
      );
      expect(result.allergies).toEqual([
        { id: 'label-1', code: 'FRAGRANCE', name: 'Fragrance' },
      ]);
      expect(result.surveyHistory).toHaveLength(1);
      expect(result.surveyHistory[0].answers[0]).toEqual(
        expect.objectContaining({
          questionCode: 'Q1',
          labels: [{ code: 'OILY', name: 'Oily Skin' }],
        }),
      );
    });
  });

  describe('updateOwnCustomerProfile', () => {
    it('should reject empty update payload', async () => {
      await expect(
        service.updateOwnCustomerProfile('user-1', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject future dateOfBirth', async () => {
      await expect(
        service.updateOwnCustomerProfile('user-1', {
          dateOfBirth: '2099-01-01',
        }),
      ).rejects.toThrow('dateOfBirth must not be in the future');
    });

    it('should create customer lazily and update fields', async () => {
      const created = {
        id: 'customer-new',
        userId: 'user-1',
        gender: Gender.NOT_PREFER_TO_SAY,
      } as Customer;

      jest
        .spyOn(customerRepository, 'findOne')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          ...created,
          phone: '+84901234567',
          avatarUrl: null,
          dateOfBirth: new Date('1995-06-15'),
          gender: Gender.MALE,
          skinTypeDetails: null,
        } as Customer);
      jest.spyOn(customerRepository, 'create').mockReturnValue(created);
      jest.spyOn(customerRepository, 'save').mockResolvedValue(created);
      jest.spyOn(customerAllergyRepository, 'find').mockResolvedValue([]);
      jest.spyOn(customerSurveyRepository, 'find').mockResolvedValue([]);

      const result = await service.updateOwnCustomerProfile('user-1', {
        phone: '+84901234567',
        dateOfBirth: '1995-06-15',
        gender: Gender.MALE,
      });

      expect(customerRepository.create).toHaveBeenCalledWith({
        userId: 'user-1',
      });
      expect(customerRepository.save).toHaveBeenCalled();
      expect(result.customer).toEqual(
        expect.objectContaining({
          phone: '+84901234567',
          gender: Gender.MALE,
        }),
      );
    });

    it('should replace allergy set with validated ALLERGY labels', async () => {
      const customer = {
        id: 'customer-1',
        userId: 'user-1',
        gender: Gender.FEMALE,
      } as Customer;
      const allergyCategory = {
        id: 'cat-allergy',
        code: 'ALLERGY',
      } as LabelCategory;
      const fragranceLabel = {
        id: 'label-1',
        code: 'FRAGRANCE',
        name: 'Fragrance',
        categoryId: 'cat-allergy',
        isActive: true,
      } as Label;

      const transaction = jest.fn(async (cb) =>
        cb({
          delete: jest.fn(),
          create: jest.fn((_, data) => data),
          save: jest.fn(),
        }),
      );
      dataSource = makeDataSource(transaction);

      service = buildService(dataSource);

      jest
        .spyOn(customerRepository, 'findOne')
        .mockResolvedValueOnce(customer)
        .mockResolvedValueOnce({
          ...customer,
          phone: null,
          avatarUrl: null,
          dateOfBirth: null,
          skinTypeDetails: null,
        } as Customer);
      jest
        .spyOn(labelCategoryRepository, 'findOneBy')
        .mockResolvedValue(allergyCategory);
      jest.spyOn(labelRepository, 'find').mockResolvedValue([fragranceLabel]);
      jest
        .spyOn(customerAllergyRepository, 'find')
        .mockResolvedValue([{ label: fragranceLabel }] as CustomerAllergy[]);
      jest.spyOn(customerSurveyRepository, 'find').mockResolvedValue([]);

      const result = await service.updateOwnCustomerProfile('user-1', {
        allergyLabelCodes: ['FRAGRANCE'],
      });

      expect(transaction).toHaveBeenCalled();
      expect(result.allergies).toEqual([
        { id: 'label-1', code: 'FRAGRANCE', name: 'Fragrance' },
      ]);
    });

    it('should clear allergies when allergyLabelCodes is empty', async () => {
      const customer = {
        id: 'customer-1',
        userId: 'user-1',
        gender: Gender.FEMALE,
      } as Customer;
      const allergyCategory = {
        id: 'cat-allergy',
        code: 'ALLERGY',
      } as LabelCategory;
      const transaction = jest.fn(async (cb) =>
        cb({
          delete: jest.fn(),
          create: jest.fn((_, data) => data),
          save: jest.fn(),
        }),
      );
      dataSource = makeDataSource(transaction);

      service = buildService(dataSource);

      jest
        .spyOn(customerRepository, 'findOne')
        .mockResolvedValueOnce(customer)
        .mockResolvedValueOnce({
          ...customer,
          phone: null,
          avatarUrl: null,
          dateOfBirth: null,
          skinTypeDetails: null,
        } as Customer);
      jest
        .spyOn(labelCategoryRepository, 'findOneBy')
        .mockResolvedValue(allergyCategory);
      jest.spyOn(labelRepository, 'find').mockResolvedValue([]);
      jest.spyOn(customerAllergyRepository, 'find').mockResolvedValue([]);
      jest.spyOn(customerSurveyRepository, 'find').mockResolvedValue([]);

      const result = await service.updateOwnCustomerProfile('user-1', {
        allergyLabelCodes: [],
      });

      expect(transaction).toHaveBeenCalled();
      expect(result.allergies).toEqual([]);
    });

    it('should reject unknown allergy label codes', async () => {
      const customer = {
        id: 'customer-1',
        userId: 'user-1',
        gender: Gender.FEMALE,
      } as Customer;
      const allergyCategory = {
        id: 'cat-allergy',
        code: 'ALLERGY',
      } as LabelCategory;

      jest.spyOn(customerRepository, 'findOne').mockResolvedValue(customer);
      jest
        .spyOn(labelCategoryRepository, 'findOneBy')
        .mockResolvedValue(allergyCategory);
      jest.spyOn(labelRepository, 'find').mockResolvedValue([]);

      await expect(
        service.updateOwnCustomerProfile('user-1', {
          allergyLabelCodes: ['UNKNOWN_ALLERGEN'],
        }),
      ).rejects.toThrow('Invalid allergy label codes: UNKNOWN_ALLERGEN');
    });
  });

  describe('updateOwnSkinType', () => {
    it('should reject unknown Baumann skin type codes', async () => {
      jest.spyOn(skinTypeRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.updateOwnSkinType('user-1', {
          skinTypeCode: 'OSPT',
        }),
      ).rejects.toThrow('Unknown Baumann skin type code: OSPT');
    });

    it('should upsert skin type details and clear axis scores', async () => {
      const customer = {
        id: 'customer-1',
        userId: 'user-1',
        gender: Gender.FEMALE,
      } as Customer;
      const skinType = {
        id: 'skin-ospt',
        code: 'OSPT',
        name: 'Oily Sensitive Pigmented Tight',
        description: null,
      } as SkinType;
      const existingDetails = {
        id: 'details-1',
        customerId: 'customer-1',
        skinTypeId: 'skin-old',
        oilyDryScore: 40,
        sensitiveResistantScore: 20,
        pigmentedNonPigmentedScore: 10,
        wrinkledTightScore: 5,
        assessedAt: new Date('2026-01-01'),
      } as CustomerSkinTypeDetails;

      jest.spyOn(skinTypeRepository, 'findOne').mockResolvedValue(skinType);
      jest
        .spyOn(customerRepository, 'findOne')
        .mockResolvedValueOnce(customer)
        .mockResolvedValueOnce({
          ...customer,
          phone: null,
          avatarUrl: null,
          dateOfBirth: null,
          skinTypeDetails: {
            ...existingDetails,
            skinTypeId: skinType.id,
            skinType,
            oilyDryScore: null,
            sensitiveResistantScore: null,
            pigmentedNonPigmentedScore: null,
            wrinkledTightScore: null,
            assessedAt: new Date('2026-08-01'),
          },
        } as Customer);
      jest
        .spyOn(customerSkinTypeDetailsRepository, 'findOne')
        .mockResolvedValue(existingDetails);
      jest
        .spyOn(customerSkinTypeDetailsRepository, 'save')
        .mockImplementation(async (row) => row as CustomerSkinTypeDetails);
      jest.spyOn(customerAllergyRepository, 'find').mockResolvedValue([]);
      jest.spyOn(customerSurveyRepository, 'find').mockResolvedValue([]);

      const result = await service.updateOwnSkinType('user-1', {
        skinTypeCode: 'OSPT',
      });

      expect(skinTypeRepository.findOne).toHaveBeenCalledWith({
        where: { code: 'OSPT' },
      });
      expect(customerSkinTypeDetailsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'customer-1',
          skinTypeId: 'skin-ospt',
          oilyDryScore: null,
          sensitiveResistantScore: null,
          pigmentedNonPigmentedScore: null,
          wrinkledTightScore: null,
        }),
      );
      expect(result.customer?.skinType).toEqual({
        code: 'OSPT',
        name: 'Oily Sensitive Pigmented Tight',
        description: null,
      });
      expect(result.customer?.baumannScores).toEqual(
        expect.objectContaining({
          oilyDryScore: null,
          sensitiveResistantScore: null,
          pigmentedNonPigmentedScore: null,
          wrinkledTightScore: null,
        }),
      );
    });

    it('should persist provided Baumann axis scores', async () => {
      const customer = {
        id: 'customer-1',
        userId: 'user-1',
        gender: Gender.FEMALE,
      } as Customer;
      const skinType = {
        id: 'skin-ospt',
        code: 'OSPT',
        name: 'Oily Sensitive Pigmented Tight',
        description: null,
      } as SkinType;
      const createdDetails = {
        customerId: 'customer-1',
      } as CustomerSkinTypeDetails;
      const assessedAt = new Date('2026-08-01');

      jest.spyOn(skinTypeRepository, 'findOne').mockResolvedValue(skinType);
      jest
        .spyOn(customerRepository, 'findOne')
        .mockResolvedValueOnce(customer)
        .mockResolvedValueOnce({
          ...customer,
          phone: null,
          avatarUrl: null,
          dateOfBirth: null,
          skinTypeDetails: {
            ...createdDetails,
            skinTypeId: skinType.id,
            skinType,
            oilyDryScore: 72,
            sensitiveResistantScore: 65,
            pigmentedNonPigmentedScore: 58,
            wrinkledTightScore: 30,
            assessedAt,
          },
        } as Customer);
      jest
        .spyOn(customerSkinTypeDetailsRepository, 'findOne')
        .mockResolvedValue(null);
      jest
        .spyOn(customerSkinTypeDetailsRepository, 'create')
        .mockReturnValue(createdDetails);
      jest
        .spyOn(customerSkinTypeDetailsRepository, 'save')
        .mockImplementation(async (row) => row as CustomerSkinTypeDetails);
      jest.spyOn(customerAllergyRepository, 'find').mockResolvedValue([]);
      jest.spyOn(customerSurveyRepository, 'find').mockResolvedValue([]);

      const result = await service.updateOwnSkinType('user-1', {
        skinTypeCode: 'OSPT',
        oilyDryScore: 72,
        sensitiveResistantScore: 65,
        pigmentedNonPigmentedScore: 58,
        wrinkledTightScore: 30,
      });

      expect(customerSkinTypeDetailsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          skinTypeId: 'skin-ospt',
          oilyDryScore: 72,
          sensitiveResistantScore: 65,
          pigmentedNonPigmentedScore: 58,
          wrinkledTightScore: 30,
        }),
      );
      expect(result.customer?.baumannScores).toEqual(
        expect.objectContaining({
          oilyDryScore: 72,
          sensitiveResistantScore: 65,
          pigmentedNonPigmentedScore: 58,
          wrinkledTightScore: 30,
          assessedAt,
        }),
      );
    });

    it('should create skin type details when none exist', async () => {
      const customer = {
        id: 'customer-1',
        userId: 'user-1',
        gender: Gender.MALE,
      } as Customer;
      const skinType = {
        id: 'skin-drnt',
        code: 'DRNT',
        name: 'Dry Resistant Non-pigmented Tight',
        description: null,
      } as SkinType;
      const createdDetails = {
        customerId: 'customer-1',
      } as CustomerSkinTypeDetails;

      jest.spyOn(skinTypeRepository, 'findOne').mockResolvedValue(skinType);
      jest
        .spyOn(customerRepository, 'findOne')
        .mockResolvedValueOnce(customer)
        .mockResolvedValueOnce({
          ...customer,
          phone: null,
          avatarUrl: null,
          dateOfBirth: null,
          skinTypeDetails: {
            ...createdDetails,
            skinTypeId: skinType.id,
            skinType,
            oilyDryScore: null,
            sensitiveResistantScore: null,
            pigmentedNonPigmentedScore: null,
            wrinkledTightScore: null,
            assessedAt: new Date('2026-08-01'),
          },
        } as Customer);
      jest
        .spyOn(customerSkinTypeDetailsRepository, 'findOne')
        .mockResolvedValue(null);
      jest
        .spyOn(customerSkinTypeDetailsRepository, 'create')
        .mockReturnValue(createdDetails);
      jest
        .spyOn(customerSkinTypeDetailsRepository, 'save')
        .mockImplementation(async (row) => row as CustomerSkinTypeDetails);
      jest.spyOn(customerAllergyRepository, 'find').mockResolvedValue([]);
      jest.spyOn(customerSurveyRepository, 'find').mockResolvedValue([]);

      const result = await service.updateOwnSkinType('user-1', {
        skinTypeCode: 'DRNT',
      });

      expect(customerSkinTypeDetailsRepository.create).toHaveBeenCalledWith({
        customerId: 'customer-1',
      });
      expect(result.customer?.skinType?.code).toBe('DRNT');
    });
  });

  describe('getConsultationContext', () => {
    const expert = { id: 'expert-b', userId: 'u-expert-b' } as Expert;
    const customer = {
      id: 'customer-1',
      userId: 'u-customer',
      phone: null,
      avatarUrl: null,
      dateOfBirth: null,
      gender: Gender.FEMALE,
      skinTypeDetails: null,
    } as Customer;
    const acceptedConsultation = {
      id: 'booking-1',
      expertId: 'expert-b',
      customerId: 'customer-1',
      status: ConsultationStatus.CONFIRMED,
    } as ConsultationRequest;

    it('returns treatmentHistory including other experts COMPLETED/CANCELLED', async () => {
      jest.spyOn(expertRepository, 'findOne').mockResolvedValue(expert);
      jest
        .spyOn(consultationRepository, 'findOne')
        .mockResolvedValue(acceptedConsultation);
      jest.spyOn(customerRepository, 'findOne').mockResolvedValue(customer);
      jest.spyOn(customerAllergyRepository, 'find').mockResolvedValue([]);
      jest.spyOn(customerSurveyRepository, 'find').mockResolvedValue([]);
      jest.spyOn(treatmentRepository, 'find').mockResolvedValue([
        {
          id: 't-completed',
          title: 'Plan A',
          status: TreatmentStatus.COMPLETED,
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-03-01'),
          expertId: 'expert-a',
          clinicId: 'clinic-1',
          clinic: { id: 'clinic-1', name: 'Skin Clinic' },
          expert: { id: 'expert-a', user: { name: 'Expert A' } },
          phases: [
            {
              id: 'phase-1',
              phaseOrder: 0,
              title: 'Phase 1',
              status: TreatmentPhaseStatus.COMPLETED,
              noteByExpert: 'Old note',
            },
          ],
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-03-01'),
        },
        {
          id: 't-cancelled',
          title: 'Plan C',
          status: TreatmentStatus.CANCELLED,
          startDate: null,
          endDate: null,
          expertId: 'expert-c',
          clinicId: null,
          clinic: null,
          expert: { id: 'expert-c', user: { name: 'Expert C' } },
          phases: [
            {
              id: 'phase-c',
              phaseOrder: 0,
              title: 'Active phase',
              status: TreatmentPhaseStatus.ACTIVE,
              noteByExpert: 'Why cancelled',
            },
          ],
          createdAt: new Date('2026-04-01'),
          updatedAt: new Date('2026-05-01'),
        },
      ] as unknown as Treatment[]);

      const result = await service.getConsultationContext(
        'u-expert-b',
        'customer-1',
        'booking-1',
      );

      expect(result.treatmentHistory).toHaveLength(2);
      expect(result.treatmentHistory[0]).toEqual(
        expect.objectContaining({
          treatmentId: 't-completed',
          status: TreatmentStatus.COMPLETED,
          expert: { id: 'expert-a', name: 'Expert A' },
          clinic: { id: 'clinic-1', name: 'Skin Clinic' },
          currentPhase: null,
          phaseCount: 1,
        }),
      );
      expect(result.treatmentHistory[1]).toEqual(
        expect.objectContaining({
          treatmentId: 't-cancelled',
          status: TreatmentStatus.CANCELLED,
          expert: { id: 'expert-c', name: 'Expert C' },
          clinic: null,
          currentPhase: expect.objectContaining({
            id: 'phase-c',
            status: TreatmentPhaseStatus.ACTIVE,
            noteByExpert: 'Why cancelled',
          }),
        }),
      );
    });

    it('returns empty treatmentHistory when customer has no non-draft treatments', async () => {
      jest.spyOn(expertRepository, 'findOne').mockResolvedValue(expert);
      jest
        .spyOn(consultationRepository, 'findOne')
        .mockResolvedValue(acceptedConsultation);
      jest.spyOn(customerRepository, 'findOne').mockResolvedValue(customer);
      jest.spyOn(customerAllergyRepository, 'find').mockResolvedValue([]);
      jest.spyOn(customerSurveyRepository, 'find').mockResolvedValue([]);
      jest.spyOn(treatmentRepository, 'find').mockResolvedValue([]);

      const result = await service.getConsultationContext(
        'u-expert-b',
        'customer-1',
        'booking-1',
      );

      expect(result.treatmentHistory).toEqual([]);
    });

    it('rejects PENDING consultation', async () => {
      jest.spyOn(expertRepository, 'findOne').mockResolvedValue(expert);
      jest.spyOn(consultationRepository, 'findOne').mockResolvedValue({
        ...acceptedConsultation,
        status: ConsultationStatus.PENDING,
      } as ConsultationRequest);

      await expect(
        service.getConsultationContext('u-expert-b', 'customer-1', 'booking-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows COMPLETED consultation', async () => {
      jest.spyOn(expertRepository, 'findOne').mockResolvedValue(expert);
      jest.spyOn(consultationRepository, 'findOne').mockResolvedValue({
        ...acceptedConsultation,
        status: ConsultationStatus.COMPLETED,
      } as ConsultationRequest);
      jest.spyOn(customerRepository, 'findOne').mockResolvedValue(customer);
      jest.spyOn(customerAllergyRepository, 'find').mockResolvedValue([]);
      jest.spyOn(customerSurveyRepository, 'find').mockResolvedValue([]);
      jest.spyOn(treatmentRepository, 'find').mockResolvedValue([]);

      const result = await service.getConsultationContext(
        'u-expert-b',
        'customer-1',
        'booking-1',
      );

      expect(result.customer.id).toBe('customer-1');
    });

    it('allows CANCELLED consultation', async () => {
      jest.spyOn(expertRepository, 'findOne').mockResolvedValue(expert);
      jest.spyOn(consultationRepository, 'findOne').mockResolvedValue({
        ...acceptedConsultation,
        status: ConsultationStatus.CANCELLED,
      } as ConsultationRequest);
      jest.spyOn(customerRepository, 'findOne').mockResolvedValue(customer);
      jest.spyOn(customerAllergyRepository, 'find').mockResolvedValue([]);
      jest.spyOn(customerSurveyRepository, 'find').mockResolvedValue([]);
      jest.spyOn(treatmentRepository, 'find').mockResolvedValue([]);

      const result = await service.getConsultationContext(
        'u-expert-b',
        'customer-1',
        'booking-1',
      );

      expect(result.customer.id).toBe('customer-1');
    });

    it('rejects when consultation is assigned to another expert', async () => {
      jest.spyOn(expertRepository, 'findOne').mockResolvedValue(expert);
      jest.spyOn(consultationRepository, 'findOne').mockResolvedValue({
        ...acceptedConsultation,
        expertId: 'expert-other',
      } as ConsultationRequest);

      await expect(
        service.getConsultationContext('u-expert-b', 'customer-1', 'booking-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects when consultation customer mismatches path customerId', async () => {
      jest.spyOn(expertRepository, 'findOne').mockResolvedValue(expert);
      jest.spyOn(consultationRepository, 'findOne').mockResolvedValue({
        ...acceptedConsultation,
        customerId: 'customer-other',
      } as ConsultationRequest);

      await expect(
        service.getConsultationContext('u-expert-b', 'customer-1', 'booking-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns 404 when consultation is missing', async () => {
      jest.spyOn(expertRepository, 'findOne').mockResolvedValue(expert);
      jest.spyOn(consultationRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.getConsultationContext(
          'u-expert-b',
          'customer-1',
          'booking-missing',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
