import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SurveyService } from './survey.service';
import { QuestionPriority } from './question.entity';

describe('SurveyService question bank', () => {
  const surveyRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const answerRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn((value) => value),
    delete: jest.fn(),
  };
  const answerLabelRepository = {
    delete: jest.fn(),
    save: jest.fn(),
    create: jest.fn((value) => value),
  };
  const surveyFaceLabelRepository = {
    find: jest.fn(),
    delete: jest.fn(),
    save: jest.fn(),
    create: jest.fn((value) => value),
  };
  const questionRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneOrFail: jest.fn(),
  };
  const questionOptionRepository = {};
  const labelRepository = {
    find: jest.fn(),
  };
  const customerRepository = {
    findOne: jest.fn(),
  };
  const skinTypeRepository = {
    findOne: jest.fn(),
  };
  const customerSkinTypeDetailsRepository = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
  const surveyRecommendationRepository = {
    delete: jest.fn(),
  };
  const storageService = {
    uploadImage: jest.fn(),
  };
  const skinVisionProvider = {
    analyze: jest.fn(),
  };

  let service: SurveyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SurveyService(
      surveyRepository as never,
      answerRepository as never,
      answerLabelRepository as never,
      surveyFaceLabelRepository as never,
      questionRepository as never,
      questionOptionRepository as never,
      labelRepository as never,
      customerRepository as never,
      skinTypeRepository as never,
      customerSkinTypeDetailsRepository as never,
      surveyRecommendationRepository as never,
      storageService as never,
      skinVisionProvider as never,
    );
    customerRepository.findOne.mockResolvedValue({
      id: 'customer-id',
      userId: 'user-id',
      dateOfBirth: new Date('2000-06-15'),
    });
  });

  it('returns core questions and unlocks matching conditional questions', async () => {
    surveyRepository.findOne.mockResolvedValue({
      id: 'survey-id',
      customerId: 'customer-id',
      answers: [
        {
          answerLabels: [{ label: { code: 'ACNE' } }],
        },
      ],
    });
    questionRepository.find.mockResolvedValue([
      {
        id: 'core',
        code: 'PRIMARY_CONCERN',
        text: 'Concern?',
        questionType: 'SINGLE_CHOICE',
        displayOrder: 1,
        priority: QuestionPriority.CORE,
        category: 'SKIN_CONCERN',
        options: [
          {
            displayOrder: 0,
            isActive: true,
            label: {
              code: 'ACNE',
              name: 'Acne',
              description: null,
              vietnameseNormalized: 'Mụn sưng, mụn viêm hoặc mụn trứng cá',
              isActive: true,
            },
          },
        ],
      },
      {
        id: 'acne-details',
        code: 'ACNE_DETAILS',
        text: 'Details?',
        questionType: 'MULTI_SELECT',
        displayOrder: 10,
        priority: QuestionPriority.CONDITIONAL,
        category: 'ACNE',
        askWhen: { anyLabelCodes: ['ACNE'] },
        options: [
          {
            displayOrder: 0,
            isActive: true,
            label: {
              code: 'BLACKHEADS',
              name: 'Blackheads',
              description: null,
              vietnameseNormalized: 'Mụn đầu đen, mụn cám',
              isActive: true,
            },
          },
        ],
      },
      {
        id: 'pigmentation-details',
        code: 'PIGMENTATION_DETAILS',
        text: 'Pigmentation?',
        questionType: 'MULTI_SELECT',
        displayOrder: 11,
        priority: QuestionPriority.CONDITIONAL,
        category: 'PIGMENTATION',
        askWhen: { anyLabelCodes: ['MELASMA'] },
        options: [
          {
            displayOrder: 0,
            isActive: true,
            label: {
              code: 'MELASMA',
              name: 'Melasma',
              description: null,
              vietnameseNormalized: 'Nám da mặt',
              isActive: true,
            },
          },
        ],
      },
      {
        id: 'empty-options',
        code: 'EMPTY_OPTIONS',
        text: 'Broken?',
        questionType: 'SINGLE_CHOICE',
        displayOrder: 2,
        priority: QuestionPriority.CORE,
        category: 'SKIN_CONCERN',
        options: [
          {
            displayOrder: 0,
            isActive: false,
            label: {
              code: 'INACTIVE',
              name: 'Inactive',
              description: null,
              vietnameseNormalized: null,
              isActive: true,
            },
          },
        ],
      },
    ]);

    const questions = await service.listQuestions('user-id', 'survey-id');

    expect(questions.map((question) => question.code)).toEqual([
      'PRIMARY_CONCERN',
      'ACNE_DETAILS',
    ]);
    expect(questions[0].options[0]).toEqual({
      labelCode: 'ACNE',
      name: 'Acne',
      description: null,
      vietnameseNormalized: 'Mụn sưng, mụn viêm hoặc mụn trứng cá',
    });
  });

  it('unlocks age-gated conditional questions from profile dateOfBirth', async () => {
    // AGE_26_35 for DOB 2000-06-15 relative to 2026
    surveyRepository.findOne.mockResolvedValue({
      id: 'survey-id',
      customerId: 'customer-id',
      answers: [],
    });
    questionRepository.find.mockResolvedValue([
      {
        id: 'core',
        code: 'PRIMARY_CONCERN',
        text: 'Concern?',
        questionType: 'SINGLE_CHOICE',
        displayOrder: 1,
        priority: QuestionPriority.CORE,
        category: 'SKIN_CONCERN',
        options: [
          {
            displayOrder: 0,
            isActive: true,
            label: {
              code: 'ACNE',
              name: 'Acne',
              description: null,
              vietnameseNormalized: null,
              isActive: true,
            },
          },
        ],
      },
      {
        id: 'age-gated',
        code: 'AGE_2635_EARLY_AGING',
        text: 'Early aging?',
        questionType: 'SINGLE_CHOICE',
        displayOrder: 55,
        priority: QuestionPriority.CONDITIONAL,
        category: 'AGE_SEGMENT',
        askWhen: {
          anyAgeGroupCodes: ['AGE_26_35'],
          minAge: 26,
          maxAge: 35,
        },
        options: [
          {
            displayOrder: 0,
            isActive: true,
            label: {
              code: 'FINE_LINES',
              name: 'Fine Lines',
              description: null,
              vietnameseNormalized: null,
              isActive: true,
            },
          },
        ],
      },
      {
        id: 'wrong-age',
        code: 'AGE_U18_OILINESS',
        text: 'Teen oil?',
        questionType: 'SINGLE_CHOICE',
        displayOrder: 45,
        priority: QuestionPriority.CONDITIONAL,
        category: 'AGE_SEGMENT',
        askWhen: { anyAgeGroupCodes: ['UNDER_18'], maxAge: 17 },
        options: [
          {
            displayOrder: 0,
            isActive: true,
            label: {
              code: 'OILY_TENDENCY',
              name: 'Oily',
              description: null,
              vietnameseNormalized: null,
              isActive: true,
            },
          },
        ],
      },
    ]);

    const questions = await service.listQuestions('user-id', 'survey-id');
    expect(questions.map((q) => q.code)).toEqual([
      'PRIMARY_CONCERN',
      'AGE_2635_EARLY_AGING',
    ]);
  });

  it('rejects a label that is not mapped to the answered question', async () => {
    surveyRepository.findOne.mockResolvedValue({
      id: 'survey-id',
      customerId: 'customer-id',
      isCompleted: false,
    });
    questionRepository.find.mockResolvedValue([
      {
        id: 'question-id',
        code: 'PRIMARY_CONCERN',
        isActive: true,
        options: [
          {
            isActive: true,
            label: { code: 'ACNE', isActive: true },
          },
        ],
      },
    ]);
    labelRepository.find.mockResolvedValue([
      { id: 'label-id', code: 'MELASMA', isActive: true },
    ]);

    await expect(
      service.submitAnswers('user-id', 'survey-id', {
        answers: [
          {
            questionId: 'question-id',
            labelCodes: ['MELASMA'],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('derives ORPT skin type from oily and pigmented labels', async () => {
    surveyRepository.findOne.mockResolvedValue({
      id: 'survey-id',
      customerId: 'customer-id',
      answers: [
        {
          answerLabels: [
            { label: { code: 'ACNE', isActive: true } },
            { label: { code: 'MELASMA', isActive: true } },
          ],
        },
      ],
    });
    skinTypeRepository.findOne.mockResolvedValue({
      id: 'st-orpt',
      code: 'ORPT',
    });
    customerSkinTypeDetailsRepository.findOne.mockResolvedValue(null);

    const details = await service.deriveAndSaveSkinType(
      'customer-id',
      'survey-id',
    );

    expect(skinTypeRepository.findOne).toHaveBeenCalledWith({
      where: { code: 'ORPT' },
    });
    expect(details.skinTypeId).toBe('st-orpt');
    expect(customerSkinTypeDetailsRepository.save).toHaveBeenCalled();
  });

  it('admin cheat updates answers, derives skin type, and clears recommendations', async () => {
    customerRepository.findOne.mockResolvedValue({ id: 'customer-id' });
    surveyRepository.findOne
      .mockResolvedValueOnce({
        id: 'survey-id',
        customerId: 'customer-id',
        isCompleted: true,
      })
      .mockResolvedValueOnce({
        id: 'survey-id',
        customerId: 'customer-id',
        answers: [
          {
            answerLabels: [{ label: { code: 'ACNE', isActive: true } }],
          },
        ],
      });

    questionRepository.findOne.mockResolvedValue({
      id: 'q1',
      code: 'PRIMARY_CONCERN',
      options: [
        {
          isActive: true,
          label: { code: 'ACNE', isActive: true },
        },
      ],
    });
    questionRepository.findOneOrFail.mockResolvedValue({
      id: 'q1',
      code: 'PRIMARY_CONCERN',
    });
    labelRepository.find.mockResolvedValue([
      { id: 'label-acne', code: 'ACNE' },
    ]);
    answerRepository.save.mockResolvedValue({ id: 'answer-1' });
    skinTypeRepository.findOne.mockResolvedValue({ id: 'st', code: 'ORNT' });
    customerSkinTypeDetailsRepository.findOne.mockResolvedValue(null);
    answerRepository.find.mockResolvedValue([
      {
        id: 'answer-1',
        questionId: 'q1',
        value: null,
        answerLabels: [
          {
            label: {
              code: 'ACNE',
              name: 'Acne',
              vietnameseNormalized: 'Mụn',
            },
          },
        ],
      },
    ]);
    surveyFaceLabelRepository.find.mockResolvedValue([]);

    const result = await service.adminUpdateSurveyByCustomerId('customer-id', [
      { questionCode: 'PRIMARY_CONCERN', labelCodes: ['ACNE'] },
    ]);

    expect(answerRepository.delete).toHaveBeenCalledWith({
      surveyId: 'survey-id',
    });
    expect(surveyRecommendationRepository.delete).toHaveBeenCalledWith({
      customerSurveyId: 'survey-id',
    });
    expect(result.answers[0].labels[0].vietnameseNormalized).toBe('Mụn');
    expect(result.faceLabels).toEqual([]);
  });

  it('throws when admin cheat targets a missing customer', async () => {
    customerRepository.findOne.mockResolvedValue(null);
    await expect(
      service.adminUpdateSurveyByCustomerId('missing', []),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SurveyService face scan', () => {
  const surveyRepository = {
    findOne: jest.fn(),
    save: jest.fn(async (value) => value),
  };
  const answerRepository = {};
  const answerLabelRepository = {};
  const surveyFaceLabelRepository = {
    find: jest.fn(),
    delete: jest.fn(),
    save: jest.fn(),
    create: jest.fn((value) => value),
  };
  const questionRepository = {};
  const questionOptionRepository = {};
  const labelRepository = {
    find: jest.fn(),
  };
  const customerRepository = {
    findOne: jest.fn(),
  };
  const skinTypeRepository = {};
  const customerSkinTypeDetailsRepository = {};
  const surveyRecommendationRepository = {};
  const storageService = {
    uploadImage: jest.fn(),
  };
  const skinVisionProvider = {
    analyze: jest.fn(),
  };

  let service: SurveyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SurveyService(
      surveyRepository as never,
      answerRepository as never,
      answerLabelRepository as never,
      surveyFaceLabelRepository as never,
      questionRepository as never,
      questionOptionRepository as never,
      labelRepository as never,
      customerRepository as never,
      skinTypeRepository as never,
      customerSkinTypeDetailsRepository as never,
      surveyRecommendationRepository as never,
      storageService as never,
      skinVisionProvider as never,
    );
    customerRepository.findOne.mockResolvedValue({
      id: 'customer-id',
      userId: 'user-id',
    });
  });

  const file = {
    buffer: Buffer.from('fake-image'),
    mimetype: 'image/jpeg',
    originalname: 'face.jpg',
  } as Express.Multer.File;

  it('uploads image, persists it, saves face labels, and replaces on re-scan', async () => {
    const survey = {
      id: 'survey-id',
      customerId: 'customer-id',
      isCompleted: false,
      faceImageUrl: null,
      faceImageKey: null,
      faceScannedAt: null,
      answers: [],
      faceLabels: [],
    };
    surveyRepository.findOne
      .mockResolvedValueOnce(survey)
      .mockResolvedValueOnce({
        ...survey,
        faceImageUrl: 'https://cdn.example.com/face.jpg',
        faceImageKey: 'images/face.jpg',
        faceScannedAt: new Date('2026-08-03T10:00:00Z'),
        answers: [],
        faceLabels: [
          {
            explanation: 'Visible inflammatory spots on the T-zone.',
            label: {
              code: 'ACNE',
              name: 'Acne',
              vietnameseNormalized: 'Mun',
            },
          },
        ],
      });
    storageService.uploadImage.mockResolvedValue({
      url: 'https://cdn.example.com/face.jpg',
      key: 'images/face.jpg',
    });
    skinVisionProvider.analyze.mockResolvedValue({
      findings: [
        {
          labelCode: 'ACNE',
          explanation: 'Visible inflammatory spots on the T-zone.',
        },
        {
          labelCode: 'UNKNOWN_FROM_AI',
          explanation: 'Should be ignored',
        },
      ],
    });
    labelRepository.find.mockResolvedValue([
      { id: 'label-acne', code: 'ACNE', isActive: true },
    ]);

    const result = await service.submitFaceScan('user-id', 'survey-id', file);

    expect(storageService.uploadImage).toHaveBeenCalled();
    expect(skinVisionProvider.analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: 'https://cdn.example.com/face.jpg',
        mimeType: 'image/jpeg',
        imageBase64: expect.any(String),
      }),
    );
    expect(surveyRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        faceImageUrl: 'https://cdn.example.com/face.jpg',
        faceImageKey: 'images/face.jpg',
      }),
    );
    expect(surveyFaceLabelRepository.delete).toHaveBeenCalledWith({
      surveyId: 'survey-id',
    });
    expect(surveyFaceLabelRepository.save).toHaveBeenCalledWith([
      {
        surveyId: 'survey-id',
        labelId: 'label-acne',
        explanation: 'Visible inflammatory spots on the T-zone.',
      },
    ]);
    expect(result.faceImageUrl).toBe('https://cdn.example.com/face.jpg');
    expect(result.faceLabels).toEqual([
      {
        code: 'ACNE',
        name: 'Acne',
        vietnameseNormalized: 'Mun',
        explanation: 'Visible inflammatory spots on the T-zone.',
      },
    ]);
  });

  it('rejects face scan on a completed survey', async () => {
    surveyRepository.findOne.mockResolvedValue({
      id: 'survey-id',
      customerId: 'customer-id',
      isCompleted: true,
    });

    await expect(
      service.submitFaceScan('user-id', 'survey-id', file),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storageService.uploadImage).not.toHaveBeenCalled();
  });

  it('rejects unsupported mime types', async () => {
    surveyRepository.findOne.mockResolvedValue({
      id: 'survey-id',
      customerId: 'customer-id',
      isCompleted: false,
    });

    await expect(
      service.submitFaceScan('user-id', 'survey-id', {
        ...file,
        mimetype: 'application/pdf',
      } as Express.Multer.File),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
