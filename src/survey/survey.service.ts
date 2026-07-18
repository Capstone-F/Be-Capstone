import {
  BadRequestException,
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
  SurveyQuestionDto,
  SurveyResponseDto,
} from './dto/survey-response.dto';
import { LabelCategory } from './label-category.entity';
import { Label } from './label.entity';
import { Question } from './question.entity';

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
    @InjectRepository(Label)
    private readonly labelRepository: Repository<Label>,
    @InjectRepository(LabelCategory)
    private readonly labelCategoryRepository: Repository<LabelCategory>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
  ) {}

  async listQuestions(): Promise<SurveyQuestionDto[]> {
    const questions = await this.questionRepository.find({
      where: { isActive: true },
      order: { displayOrder: 'ASC' },
    });

    const categoryMapping: Record<string, string> = {
      PRIMARY_CONCERN: 'SKIN_CONCERN',
      SKIN_GOALS: 'SKIN_GOAL',
      LIFESTYLE: 'LIFESTYLE',
    };

    const categories = await this.labelCategoryRepository.find({
      relations: ['labels'],
    });

    return questions.map((q) => {
      const categoryCode = categoryMapping[q.code];
      const category = categories.find((c) => c.code === categoryCode);
      const options = (category?.labels ?? [])
        .filter((l) => l.isActive)
        .map((l) => ({
          labelCode: l.code,
          text: l.name,
        }));

      return {
        id: q.id,
        code: q.code,
        text: q.text,
        questionType: q.questionType,
        displayOrder: q.displayOrder,
        intent: categoryCode,
        options,
      };
    });
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
    const questions = await this.questionRepository.findBy({
      id: In(questionIds),
      isActive: true,
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
