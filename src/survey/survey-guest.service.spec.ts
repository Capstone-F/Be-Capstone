import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { generateGuestToken, hashGuestToken } from '../auth/guest-token';
import { Gender } from '../users/gender.enum';
import { SurveyService } from './survey.service';

describe('SurveyService guest flow', () => {
  const surveyRepository = {
    findOne: jest.fn(),
    save: jest.fn(async (value) => ({
      id: 'survey-id',
      createdAt: new Date('2026-08-01T00:00:00Z'),
      ...value,
    })),
    create: jest.fn((value) => value),
  };
  const answerRepository = {
    count: jest.fn(),
    find: jest.fn(),
  };
  const answerLabelRepository = {};
  const surveyFaceLabelRepository = {
    find: jest.fn().mockResolvedValue([]),
  };
  const questionRepository = {};
  const questionOptionRepository = {};
  const labelRepository = {
    find: jest.fn(),
  };
  const labelCategoryRepository = {
    findOneBy: jest.fn(),
  };
  const customerRepository = {
    findOne: jest.fn(),
    save: jest.fn(async (value) => ({
      id: value.id ?? 'guest-customer-id',
      ...value,
    })),
    create: jest.fn((value) => value),
  };
  const customerAllergyRepository = {
    delete: jest.fn(),
    save: jest.fn(),
    create: jest.fn((value) => value),
  };
  const skinTypeRepository = {
    findOne: jest.fn(),
  };
  const customerSkinTypeDetailsRepository = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
  const surveyRecommendationRepository = {};
  const manager = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(async (value) => value),
    remove: jest.fn(),
    delete: jest.fn(),
    create: jest.fn((_entity, value) => value),
  };
  const dataSource = {
    transaction: jest.fn(async (fn) => fn(manager)),
  };
  const storageService = {};
  const skinVisionProvider = {};

  let service: SurveyService;

  beforeEach(() => {
    jest.clearAllMocks();
    const qb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    manager.createQueryBuilder.mockReturnValue(qb);
    manager.findOne.mockResolvedValue(null);
    manager.find.mockResolvedValue([]);

    service = new SurveyService(
      surveyRepository as never,
      answerRepository as never,
      answerLabelRepository as never,
      surveyFaceLabelRepository as never,
      questionRepository as never,
      questionOptionRepository as never,
      labelRepository as never,
      labelCategoryRepository as never,
      customerRepository as never,
      customerAllergyRepository as never,
      skinTypeRepository as never,
      customerSkinTypeDetailsRepository as never,
      surveyRecommendationRepository as never,
      dataSource as never,
      storageService as never,
      skinVisionProvider as never,
    );
  });

  it('startGuestSurvey creates guest customer and returns guestToken', async () => {
    const result = await service.startGuestSurvey({
      gender: Gender.FEMALE,
      dateOfBirth: '1995-06-15',
    });

    expect(result.guestToken).toEqual(expect.any(String));
    expect(result.guestToken!.length).toBeGreaterThan(20);
    expect(customerRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        guestTokenHash: hashGuestToken(result.guestToken!),
      }),
    );
    expect(result.id).toBe('survey-id');
    expect(result.isCompleted).toBe(false);
  });

  it('rejects expired guest tokens', async () => {
    customerRepository.findOne.mockResolvedValue({
      id: 'guest-customer-id',
      userId: null,
      guestTokenHash: hashGuestToken('expired-token'),
      guestExpiresAt: new Date('2020-01-01T00:00:00Z'),
    });

    await expect(
      service.getSurveyForActor(
        { kind: 'guest', guestToken: 'expired-token' },
        'survey-id',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('claimGuestSurvey merges guest surveys into auth customer', async () => {
    const token = generateGuestToken();
    customerRepository.findOne
      .mockResolvedValueOnce({
        id: 'guest-id',
        userId: null,
        guestTokenHash: hashGuestToken(token),
        guestExpiresAt: new Date(Date.now() + 86_400_000),
        dateOfBirth: new Date('1995-06-15'),
        gender: Gender.FEMALE,
      })
      .mockResolvedValueOnce({
        id: 'auth-id',
        userId: 'user-id',
        dateOfBirth: null,
        gender: Gender.NOT_PREFER_TO_SAY,
      })
      .mockResolvedValueOnce({
        id: 'auth-id',
        userId: 'user-id',
      });

    surveyRepository.findOne.mockResolvedValue({
      id: 'survey-id',
      customerId: 'auth-id',
      isCompleted: true,
      completedAt: new Date(),
      createdAt: new Date(),
      faceImageUrl: null,
      faceScannedAt: null,
      answers: [],
      faceLabels: [],
    });

    const claimed = await service.claimGuestSurvey('user-id', token);

    expect(dataSource.transaction).toHaveBeenCalled();
    expect(manager.delete).toHaveBeenCalled();
    expect(claimed?.id).toBe('survey-id');
  });

  it('claimGuestSurvey rejects empty token', async () => {
    await expect(
      service.claimGuestSurvey('user-id', '  '),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
