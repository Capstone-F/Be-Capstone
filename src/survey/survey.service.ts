import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Customer } from '../users/customer.entity';
import { AnswerLabel } from './answer-label.entity';
import { Answer } from './answer.entity';
import { CustomerSurvey } from './customer-survey.entity';
import { SubmitAnswersDto } from './dto/submit-answers.dto';
import {
  AdminQuestionOptionInputDto,
  AdminSurveyQuestionDto,
  CreateSurveyQuestionDto,
  ReplaceQuestionOptionsDto,
  UpdateSurveyQuestionDto,
} from './dto/admin-survey-question.dto';
import {
  SurveyQuestionDto,
  SurveyResponseDto,
} from './dto/survey-response.dto';
import { Label } from './label.entity';
import { Question, QuestionPriority } from './question.entity';
import { QuestionOption } from './question-option.entity';

@Injectable()
export class SurveyService {
  constructor(
    @InjectRepository(CustomerSurvey)
    private readonly surveyRepository: Repository<CustomerSurvey>,
    @InjectRepository(Answer)
    private readonly answerRepository: Repository<Answer>,
    @InjectRepository(AnswerLabel)
    private readonly answerLabelRepository: Repository<AnswerLabel>,
    @InjectRepository(Question)
    private readonly questionRepository: Repository<Question>,
    @InjectRepository(QuestionOption)
    private readonly questionOptionRepository: Repository<QuestionOption>,
    @InjectRepository(Label)
    private readonly labelRepository: Repository<Label>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
  ) {}

  async listAdminQuestions(
    activeOnly = false,
  ): Promise<AdminSurveyQuestionDto[]> {
    const questions = await this.questionRepository.find({
      where: activeOnly ? { isActive: true } : {},
      relations: ['options', 'options.label'],
      order: { displayOrder: 'ASC' },
    });
    return questions.map((question) => this.toAdminQuestionDto(question));
  }

  async getAdminQuestion(id: string): Promise<AdminSurveyQuestionDto> {
    return this.toAdminQuestionDto(await this.requireQuestionWithOptions(id));
  }

  async createAdminQuestion(
    dto: CreateSurveyQuestionDto,
  ): Promise<AdminSurveyQuestionDto> {
    if (await this.questionRepository.findOneBy({ code: dto.code.trim() })) {
      throw new ConflictException(`Question code ${dto.code} already exists`);
    }
    const optionLabels = await this.resolveOptionLabels(dto.options);
    const question = await this.questionRepository.save(
      this.questionRepository.create({
        code: dto.code.trim(),
        text: dto.text.trim(),
        questionType: dto.questionType.trim(),
        displayOrder: dto.displayOrder,
        priority: dto.priority,
        category: dto.category.trim(),
        intent: dto.intent?.trim() ?? null,
        askWhen: dto.askWhen ?? null,
        isActive: dto.isActive ?? true,
      }),
    );
    await this.saveQuestionOptions(question.id, dto.options, optionLabels);
    return this.getAdminQuestion(question.id);
  }

  async updateAdminQuestion(
    id: string,
    dto: UpdateSurveyQuestionDto,
  ): Promise<AdminSurveyQuestionDto> {
    const question = await this.questionRepository.findOneBy({ id });
    if (!question) throw new NotFoundException(`Question ${id} not found`);
    if (dto.code !== undefined) {
      const code = dto.code.trim();
      const duplicate = await this.questionRepository.findOneBy({ code });
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException(`Question code ${code} already exists`);
      }
      question.code = code;
    }
    if (dto.text !== undefined) question.text = dto.text.trim();
    if (dto.questionType !== undefined) {
      question.questionType = dto.questionType.trim();
    }
    if (dto.displayOrder !== undefined) {
      question.displayOrder = dto.displayOrder;
    }
    if (dto.priority !== undefined) question.priority = dto.priority;
    if (dto.category !== undefined) question.category = dto.category.trim();
    if (dto.intent !== undefined) question.intent = dto.intent.trim();
    if (dto.askWhen !== undefined) question.askWhen = dto.askWhen;
    if (dto.isActive !== undefined) question.isActive = dto.isActive;
    await this.questionRepository.save(question);
    return this.getAdminQuestion(id);
  }

  async replaceAdminQuestionOptions(
    id: string,
    dto: ReplaceQuestionOptionsDto,
  ): Promise<AdminSurveyQuestionDto> {
    await this.requireQuestionWithOptions(id);
    const optionLabels = await this.resolveOptionLabels(dto.options);
    await this.questionOptionRepository.delete({ questionId: id });
    await this.saveQuestionOptions(id, dto.options, optionLabels);
    return this.getAdminQuestion(id);
  }

  async deactivateAdminQuestion(id: string): Promise<AdminSurveyQuestionDto> {
    const question = await this.questionRepository.findOneBy({ id });
    if (!question) throw new NotFoundException(`Question ${id} not found`);
    question.isActive = false;
    await this.questionRepository.save(question);
    return this.getAdminQuestion(id);
  }

  async listQuestions(
    userId: string,
    surveyId?: string,
  ): Promise<SurveyQuestionDto[]> {
    let answeredLabelCodes = new Set<string>();
    if (surveyId) {
      const customer = await this.requireCustomer(userId);
      const survey = await this.surveyRepository.findOne({
        where: { id: surveyId, customerId: customer.id },
        relations: [
          'answers',
          'answers.answerLabels',
          'answers.answerLabels.label',
        ],
      });
      if (!survey) {
        throw new NotFoundException(`Survey ${surveyId} not found`);
      }
      answeredLabelCodes = new Set(
        (survey.answers ?? []).flatMap((answer) =>
          (answer.answerLabels ?? []).map(
            (answerLabel) => answerLabel.label.code,
          ),
        ),
      );
    }

    const questions = await this.questionRepository.find({
      where: { isActive: true },
      relations: ['options', 'options.label'],
      order: { displayOrder: 'ASC' },
    });
    return questions
      .filter((question) => {
        if (question.priority === QuestionPriority.CORE) return true;
        if (question.priority !== QuestionPriority.CONDITIONAL || !surveyId) {
          return false;
        }
        const requiredCodes = question.askWhen?.anyLabelCodes ?? [];
        return (
          question.askWhen?.always === true ||
          requiredCodes.some((code) => answeredLabelCodes.has(code))
        );
      })
      .map((q) => ({
        id: q.id,
        code: q.code,
        text: q.text,
        questionType: q.questionType,
        displayOrder: q.displayOrder,
        priority: q.priority,
        category: q.category,
        options: (q.options ?? [])
          .filter((option) => option.isActive && option.label?.isActive)
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((option) => ({
            labelCode: option.label.code,
            name: option.label.name,
            description: option.label.description,
          })),
      }));
  }

  async startSurvey(userId: string): Promise<SurveyResponseDto> {
    const customer = await this.getOrCreateCustomerByUserId(userId);
    const survey = await this.surveyRepository.save(
      this.surveyRepository.create({
        customerId: customer.id,
        isCompleted: false,
        completedAt: null,
      }),
    );
    return this.toSurveyDto(survey, []);
  }

  async submitAnswers(
    userId: string,
    surveyId: string,
    dto: SubmitAnswersDto,
  ): Promise<SurveyResponseDto> {
    const { survey } = await this.getOwnedInProgressSurvey(userId, surveyId);

    const questionIds = [...new Set(dto.answers.map((a) => a.questionId))];
    const questions = await this.questionRepository.find({
      where: { id: In(questionIds), isActive: true },
      relations: ['options', 'options.label'],
    });
    if (questions.length !== questionIds.length) {
      throw new BadRequestException('One or more questions are invalid');
    }

    const allLabelCodes = [
      ...new Set(dto.answers.flatMap((a) => a.labelCodes.map((c) => c.trim()))),
    ];
    const labels = await this.labelRepository.find({
      where: { code: In(allLabelCodes), isActive: true },
    });
    const labelByCode = new Map(labels.map((l) => [l.code, l]));
    for (const code of allLabelCodes) {
      if (!labelByCode.has(code)) {
        throw new BadRequestException(`Unknown label code: ${code}`);
      }
    }

    const questionById = new Map(
      questions.map((question) => [question.id, question]),
    );
    for (const answer of dto.answers) {
      const question = questionById.get(answer.questionId)!;
      const allowedCodes = new Set(
        (question.options ?? [])
          .filter((option) => option.isActive && option.label?.isActive)
          .map((option) => option.label.code),
      );
      for (const code of answer.labelCodes.map((value) => value.trim())) {
        if (!allowedCodes.has(code)) {
          throw new BadRequestException(
            `Label code ${code} is not an active option for question ${question.code}`,
          );
        }
      }
    }

    for (const answerDto of dto.answers) {
      let answer = await this.answerRepository.findOne({
        where: { surveyId: survey.id, questionId: answerDto.questionId },
      });
      if (!answer) {
        answer = await this.answerRepository.save(
          this.answerRepository.create({
            surveyId: survey.id,
            questionId: answerDto.questionId,
            value: answerDto.value?.trim() ?? null,
          }),
        );
      } else {
        answer.value = answerDto.value?.trim() ?? null;
        await this.answerRepository.save(answer);
        await this.answerLabelRepository.delete({ answerId: answer.id });
      }

      const uniqueCodes = [
        ...new Set(answerDto.labelCodes.map((c) => c.trim())),
      ];
      await this.answerLabelRepository.save(
        uniqueCodes.map((code) =>
          this.answerLabelRepository.create({
            answerId: answer.id,
            labelId: labelByCode.get(code)!.id,
          }),
        ),
      );
    }

    return this.getSurveyForUser(userId, surveyId);
  }

  async completeSurvey(
    userId: string,
    surveyId: string,
  ): Promise<SurveyResponseDto> {
    const { survey } = await this.getOwnedInProgressSurvey(userId, surveyId);

    const answerCount = await this.answerRepository.count({
      where: { surveyId: survey.id },
    });
    if (answerCount < 1) {
      throw new BadRequestException(
        'Survey must have at least one answer before completion',
      );
    }

    survey.isCompleted = true;
    survey.completedAt = new Date();
    await this.surveyRepository.save(survey);

    return this.getSurveyForUser(userId, surveyId);
  }

  async getSurveyForUser(
    userId: string,
    surveyId: string,
  ): Promise<SurveyResponseDto> {
    const customer = await this.requireCustomer(userId);
    const survey = await this.surveyRepository.findOne({
      where: { id: surveyId, customerId: customer.id },
      relations: [
        'answers',
        'answers.answerLabels',
        'answers.answerLabels.label',
      ],
    });
    if (!survey) {
      throw new NotFoundException(`Survey ${surveyId} not found`);
    }
    return this.toSurveyDto(survey, survey.answers ?? []);
  }

  private async requireQuestionWithOptions(id: string): Promise<Question> {
    const question = await this.questionRepository.findOne({
      where: { id },
      relations: ['options', 'options.label'],
    });
    if (!question) throw new NotFoundException(`Question ${id} not found`);
    return question;
  }

  private async resolveOptionLabels(
    options: AdminQuestionOptionInputDto[],
  ): Promise<Map<string, Label>> {
    const codes = options.map((option) => option.labelCode.trim());
    if (new Set(codes).size !== codes.length) {
      throw new BadRequestException(
        'Question option label codes must be unique',
      );
    }
    const labels = await this.labelRepository.find({
      where: { code: In(codes), isActive: true },
    });
    const labelByCode = new Map(labels.map((label) => [label.code, label]));
    for (const code of codes) {
      if (!labelByCode.has(code)) {
        throw new BadRequestException(`Unknown active label code: ${code}`);
      }
    }
    return labelByCode;
  }

  private async saveQuestionOptions(
    questionId: string,
    options: AdminQuestionOptionInputDto[],
    labelByCode: Map<string, Label>,
  ): Promise<void> {
    await this.questionOptionRepository.save(
      options.map((option) =>
        this.questionOptionRepository.create({
          questionId,
          labelId: labelByCode.get(option.labelCode.trim())!.id,
          displayOrder: option.displayOrder,
          isActive: true,
        }),
      ),
    );
  }

  private toAdminQuestionDto(question: Question): AdminSurveyQuestionDto {
    return {
      id: question.id,
      code: question.code,
      text: question.text,
      questionType: question.questionType,
      displayOrder: question.displayOrder,
      priority: question.priority,
      category: question.category,
      intent: question.intent,
      askWhen: question.askWhen,
      isActive: question.isActive,
      options: (question.options ?? [])
        .filter((option) => option.label)
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((option) => ({
          labelCode: option.label.code,
          name: option.label.name,
          description: option.label.description,
        })),
    };
  }

  private async getOwnedInProgressSurvey(
    userId: string,
    surveyId: string,
  ): Promise<{ customer: Customer; survey: CustomerSurvey }> {
    const customer = await this.requireCustomer(userId);
    const survey = await this.surveyRepository.findOne({
      where: { id: surveyId, customerId: customer.id },
    });
    if (!survey) {
      throw new NotFoundException(`Survey ${surveyId} not found`);
    }
    if (survey.isCompleted) {
      throw new BadRequestException('Survey is already completed');
    }
    return { customer, survey };
  }

  private async requireCustomer(userId: string): Promise<Customer> {
    const customer = await this.customerRepository.findOne({
      where: { userId },
    });
    if (!customer) {
      throw new ForbiddenException('No customer profile for this user');
    }
    return customer;
  }

  private async getOrCreateCustomerByUserId(userId: string): Promise<Customer> {
    const existing = await this.customerRepository.findOne({
      where: { userId },
    });
    if (existing) {
      return existing;
    }
    return this.customerRepository.save(
      this.customerRepository.create({ userId }),
    );
  }

  private toSurveyDto(
    survey: CustomerSurvey,
    answers: Answer[],
  ): SurveyResponseDto {
    return {
      id: survey.id,
      isCompleted: survey.isCompleted,
      completedAt: survey.completedAt,
      createdAt: survey.createdAt,
      answers: (answers ?? []).map((a) => ({
        id: a.id,
        questionId: a.questionId,
        value: a.value,
        labels: (a.answerLabels ?? []).map((al) => ({
          code: al.label.code,
          name: al.label.name,
        })),
      })),
    };
  }
}
