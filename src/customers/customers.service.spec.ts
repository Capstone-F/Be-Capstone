import { BadRequestException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { ConsultationRequest } from '../consultations/consultation-request.entity';
import { CustomerSurvey } from '../survey/customer-survey.entity';
import { Label } from '../survey/label.entity';
import { LabelCategory } from '../survey/label-category.entity';
import { Treatment } from '../treatments/treatment.entity';
import { CustomerAllergy } from '../users/customer-allergy.entity';
import { Customer } from '../users/customer.entity';
import { Expert } from '../users/expert.entity';
import { Gender } from '../users/gender.enum';
import { CustomersService } from './customers.service';

const makeRepo = <T extends object>(overrides: Partial<Repository<T>> = {}) =>
  ({
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
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
});
