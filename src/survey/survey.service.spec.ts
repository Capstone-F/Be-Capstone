import { BadRequestException } from '@nestjs/common';
import { SurveyService } from './survey.service';
import { QuestionPriority } from './question.entity';

describe('SurveyService question bank', () => {
  const surveyRepository = {
    findOne: jest.fn(),
  };
  const answerRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn((value) => value),
  };
  const answerLabelRepository = {
    delete: jest.fn(),
    save: jest.fn(),
    create: jest.fn((value) => value),
  };
  const questionRepository = {
    find: jest.fn(),
  };
  const questionOptionRepository = {};
  const labelRepository = {
    find: jest.fn(),
  };
  const customerRepository = {
    findOne: jest.fn(),
  };

  let service: SurveyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SurveyService(
      surveyRepository as never,
      answerRepository as never,
      answerLabelRepository as never,
      questionRepository as never,
      questionOptionRepository as never,
      labelRepository as never,
      customerRepository as never,
    );
    customerRepository.findOne.mockResolvedValue({
      id: 'customer-id',
      userId: 'user-id',
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
        options: [],
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
        options: [],
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
    });
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
});
