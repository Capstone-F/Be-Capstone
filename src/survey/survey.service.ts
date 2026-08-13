import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import {
  generateGuestToken,
  guestExpiresAt,
  hashGuestToken,
  type SurveyActor,
} from '../auth/guest-token';
import { CustomerAllergy } from '../users/customer-allergy.entity';
import { Customer } from '../users/customer.entity';
import { CustomerSkinTypeDetails } from '../users/customer-skin-type-details.entity';
import { Gender } from '../users/gender.enum';
import { SkinType } from '../users/skin-type.entity';
import { SurveyRecommendation } from '../recommendations/survey-recommendation.entity';
import {
  SKIN_VISION_PROVIDER,
  type SkinVisionProvider,
} from '../skin-vision/skin-vision.types';
import { StorageService } from '../uploads/storage.service';
import { AnswerLabel } from './answer-label.entity';
import { Answer } from './answer.entity';
import { CustomerSurvey } from './customer-survey.entity';
import { SubmitAnswersDto } from './dto/submit-answers.dto';
import { StartSurveyDto } from './dto/start-survey.dto';
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
import { buildAskWhenContext, matchesAskWhen } from './ask-when.util';
import { LabelCategory } from './label-category.entity';
import { Label } from './label.entity';
import { Question, QuestionAskWhen, QuestionPriority } from './question.entity';
import { QuestionOption } from './question-option.entity';
import { NEXT_QUESTIONS_BATCH_SIZE } from './survey.constants';
import { SurveyFaceLabel } from './survey-face-label.entity';

const ALLERGY_CATEGORY_CODE = 'ALLERGY';

const ALLOWED_FACE_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

@Injectable()
export class SurveyService {
  private readonly logger = new Logger(SurveyService.name);

  constructor(
    @InjectRepository(CustomerSurvey)
    private readonly surveyRepository: Repository<CustomerSurvey>,
    @InjectRepository(Answer)
    private readonly answerRepository: Repository<Answer>,
    @InjectRepository(AnswerLabel)
    private readonly answerLabelRepository: Repository<AnswerLabel>,
    @InjectRepository(SurveyFaceLabel)
    private readonly surveyFaceLabelRepository: Repository<SurveyFaceLabel>,
    @InjectRepository(Question)
    private readonly questionRepository: Repository<Question>,
    @InjectRepository(QuestionOption)
    private readonly questionOptionRepository: Repository<QuestionOption>,
    @InjectRepository(Label)
    private readonly labelRepository: Repository<Label>,
    @InjectRepository(LabelCategory)
    private readonly labelCategoryRepository: Repository<LabelCategory>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(CustomerAllergy)
    private readonly customerAllergyRepository: Repository<CustomerAllergy>,
    @InjectRepository(SkinType)
    private readonly skinTypeRepository: Repository<SkinType>,
    @InjectRepository(CustomerSkinTypeDetails)
    private readonly customerSkinTypeDetailsRepository: Repository<CustomerSkinTypeDetails>,
    @InjectRepository(SurveyRecommendation)
    private readonly surveyRecommendationRepository: Repository<SurveyRecommendation>,
    private readonly dataSource: DataSource,
    private readonly storageService: StorageService,
    @Inject(SKIN_VISION_PROVIDER)
    private readonly skinVisionProvider: SkinVisionProvider,
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
      throw new ConflictException(`Mã câu hỏi ${dto.code} đã tồn tại`);
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
    if (!question) throw new NotFoundException(`Không tìm thấy câu hỏi ${id}`);
    if (dto.code !== undefined) {
      const code = dto.code.trim();
      const duplicate = await this.questionRepository.findOneBy({ code });
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException(`Mã câu hỏi ${code} đã tồn tại`);
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
    if (!question) throw new NotFoundException(`Không tìm thấy câu hỏi ${id}`);
    question.isActive = false;
    await this.questionRepository.save(question);
    return this.getAdminQuestion(id);
  }

  async listQuestions(
    actor: SurveyActor | null,
    surveyId?: string,
  ): Promise<SurveyQuestionDto[]> {
    if (surveyId) {
      if (!actor) {
        throw new UnauthorizedException(
          'Cần xác thực hoặc X-Guest-Token cho các câu hỏi theo phạm vi khảo sát',
        );
      }
      return this.listProgressiveQuestions(actor, surveyId);
    }

    const questions = await this.questionRepository.find({
      where: { isActive: true },
      relations: ['options', 'options.label'],
      order: { displayOrder: 'ASC' },
    });
    return questions
      .filter((question) => question.priority === QuestionPriority.CORE)
      .map((q) => this.toQuestionDto(q))
      .filter((question) => question.options.length > 0);
  }

  /**
   * Cumulative progressive list for an owned survey:
   * answered prefix + next unanswered batch (unlocked CONDITIONAL first from current
   * labels/DOB, then fill CORE; if no CONDITIONAL, OPTIONAL then fill CORE).
   * Skipping CORE is allowed — CONDITIONAL unlock from whatever labels exist so far.
   */
  private async listProgressiveQuestions(
    actor: SurveyActor,
    surveyId: string,
  ): Promise<SurveyQuestionDto[]> {
    const customer = await this.resolveCustomer(actor);
    const dateOfBirth = customer.dateOfBirth ?? null;
    const survey = await this.surveyRepository.findOne({
      where: { id: surveyId, customerId: customer.id },
      relations: [
        'answers',
        'answers.answerLabels',
        'answers.answerLabels.label',
      ],
    });
    if (!survey) {
      throw new NotFoundException(`Không tìm thấy khảo sát ${surveyId}`);
    }

    const answeredQuestionIds = new Set(
      (survey.answers ?? [])
        .map((answer) => answer.questionId)
        .filter((id): id is string => Boolean(id)),
    );
    const answeredLabelCodes = new Set(
      (survey.answers ?? []).flatMap((answer) =>
        (answer.answerLabels ?? []).map(
          (answerLabel) => answerLabel.label.code,
        ),
      ),
    );
    const askWhenCtx = buildAskWhenContext(answeredLabelCodes, dateOfBirth);

    const activeQuestions = (
      await this.questionRepository.find({
        where: { isActive: true },
        relations: ['options', 'options.label'],
        order: { displayOrder: 'ASC' },
      })
    ).filter((question) => this.questionHasActiveOptions(question));

    const unansweredCore = activeQuestions
      .filter(
        (question) =>
          question.priority === QuestionPriority.CORE &&
          !answeredQuestionIds.has(question.id),
      )
      .sort((a, b) => a.displayOrder - b.displayOrder);
    const unlockedUnansweredConditional = activeQuestions
      .filter(
        (question) =>
          question.priority === QuestionPriority.CONDITIONAL &&
          !answeredQuestionIds.has(question.id) &&
          matchesAskWhen(question.askWhen, askWhenCtx),
      )
      .sort((a, b) => a.displayOrder - b.displayOrder);
    const unansweredOptional = activeQuestions
      .filter(
        (question) =>
          question.priority === QuestionPriority.OPTIONAL &&
          !answeredQuestionIds.has(question.id) &&
          this.isOptionalEligible(question.askWhen, askWhenCtx),
      )
      .sort((a, b) => a.displayOrder - b.displayOrder);

    let nextBatch: Question[];
    if (unlockedUnansweredConditional.length > 0) {
      const conditionalSlice = unlockedUnansweredConditional.slice(
        0,
        NEXT_QUESTIONS_BATCH_SIZE,
      );
      const remainingSlots =
        NEXT_QUESTIONS_BATCH_SIZE - conditionalSlice.length;
      nextBatch = [
        ...conditionalSlice,
        ...unansweredCore.slice(0, remainingSlots),
      ];
    } else if (unansweredOptional.length > 0) {
      // Skip-friendly: unanswered CORE does not block OPTIONAL.
      const optionalSlice = unansweredOptional.slice(
        0,
        NEXT_QUESTIONS_BATCH_SIZE,
      );
      const remainingSlots = NEXT_QUESTIONS_BATCH_SIZE - optionalSlice.length;
      nextBatch = [
        ...optionalSlice,
        ...unansweredCore.slice(0, remainingSlots),
      ];
    } else {
      nextBatch = unansweredCore.slice(0, NEXT_QUESTIONS_BATCH_SIZE);
    }

    const prefix = activeQuestions
      .filter((question) => answeredQuestionIds.has(question.id))
      .sort((a, b) => a.displayOrder - b.displayOrder);

    // Cumulative: answered prefix + next batch at end (do not re-sort combined).
    return [...prefix, ...nextBatch].map((q) => this.toQuestionDto(q));
  }

  private isOptionalEligible(
    askWhen: QuestionAskWhen | null | undefined,
    askWhenCtx: ReturnType<typeof buildAskWhenContext>,
  ): boolean {
    if (
      !askWhen ||
      (askWhen.always !== true &&
        !askWhen.anyLabelCodes?.length &&
        !askWhen.allLabelCodes?.length &&
        !askWhen.anyAgeGroupCodes?.length &&
        askWhen.minAge == null &&
        askWhen.maxAge == null &&
        !askWhen.noneLabelCodes?.length)
    ) {
      return true;
    }
    return matchesAskWhen(askWhen, askWhenCtx);
  }

  private questionHasActiveOptions(question: Question): boolean {
    return (question.options ?? []).some(
      (option) => option.isActive && option.label?.isActive,
    );
  }

  private toQuestionDto(q: Question): SurveyQuestionDto {
    return {
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
          vietnameseNormalized: option.label.vietnameseNormalized ?? null,
        })),
    };
  }

  async startSurvey(
    userId: string,
    dto: StartSurveyDto = {},
  ): Promise<SurveyResponseDto> {
    const customer = await this.getOrCreateCustomerByUserId(userId);
    await this.applyOptionalProfile(customer, dto);
    const survey = await this.surveyRepository.save(
      this.surveyRepository.create({
        customerId: customer.id,
        isCompleted: false,
        completedAt: null,
        faceImageUrl: null,
        faceImageKey: null,
        faceScannedAt: null,
      }),
    );
    return this.toSurveyDto(survey, [], []);
  }

  async startGuestSurvey(dto: StartSurveyDto = {}): Promise<SurveyResponseDto> {
    const rawToken = generateGuestToken();
    const customer = await this.customerRepository.save(
      this.customerRepository.create({
        userId: null,
        guestTokenHash: hashGuestToken(rawToken),
        guestExpiresAt: guestExpiresAt(),
        dateOfBirth: null,
        gender: Gender.NOT_PREFER_TO_SAY,
      }),
    );
    await this.applyOptionalProfile(customer, dto);
    const survey = await this.surveyRepository.save(
      this.surveyRepository.create({
        customerId: customer.id,
        isCompleted: false,
        completedAt: null,
        faceImageUrl: null,
        faceImageKey: null,
        faceScannedAt: null,
      }),
    );
    return { ...this.toSurveyDto(survey, [], []), guestToken: rawToken };
  }

  async submitFaceScan(
    userId: string,
    surveyId: string,
    file: Express.Multer.File,
  ): Promise<SurveyResponseDto> {
    const { survey } = await this.getOwnedInProgressSurvey(
      { kind: 'user', userId },
      surveyId,
    );

    if (!file?.buffer?.length) {
      throw new BadRequestException('file là bắt buộc');
    }
    if (!ALLOWED_FACE_MIME.has(file.mimetype)) {
      throw new BadRequestException(
        'Loại tệp không được hỗ trợ. Cho phép: jpeg, png, webp, gif, heic, heif',
      );
    }

    const uploaded = await this.storageService.uploadImage({
      buffer: file.buffer,
      contentType: file.mimetype,
      originalName: file.originalname,
    });

    survey.faceImageUrl = uploaded.url;
    survey.faceImageKey = uploaded.key;
    survey.faceScannedAt = new Date();
    await this.surveyRepository.save(survey);

    const analysis = await this.skinVisionProvider.analyze({
      imageUrl: uploaded.url,
      imageBase64: file.buffer.toString('base64'),
      mimeType: file.mimetype,
    });

    const findingsByCode = new Map<string, string>();
    for (const finding of analysis.findings ?? []) {
      const code = finding.labelCode?.trim();
      if (!code || findingsByCode.has(code)) continue;
      const explanation = (finding.explanation ?? '').trim();
      if (!explanation) continue;
      findingsByCode.set(code, explanation);
    }
    const requestedCodes = [...findingsByCode.keys()];

    let resolvedLabels: Label[] = [];
    if (requestedCodes.length > 0) {
      resolvedLabels = await this.labelRepository.find({
        where: { code: In(requestedCodes), isActive: true },
      });
      const known = new Set(resolvedLabels.map((label) => label.code));
      const unknown = requestedCodes.filter((code) => !known.has(code));
      if (unknown.length > 0) {
        this.logger.warn(
          `Face scan ignored unknown label codes for survey ${surveyId}: ${unknown.join(', ')}`,
        );
      }
    }

    await this.surveyFaceLabelRepository.delete({ surveyId: survey.id });
    if (resolvedLabels.length > 0) {
      await this.surveyFaceLabelRepository.save(
        resolvedLabels.map((label) =>
          this.surveyFaceLabelRepository.create({
            surveyId: survey.id,
            labelId: label.id,
            explanation: findingsByCode.get(label.code) ?? null,
          }),
        ),
      );
    }

    return this.getSurveyForActor({ kind: 'user', userId }, surveyId);
  }

  async submitAnswers(
    actor: SurveyActor,
    surveyId: string,
    dto: SubmitAnswersDto,
  ): Promise<SurveyResponseDto> {
    const { survey } = await this.getOwnedInProgressSurvey(actor, surveyId);

    const questionIds = [...new Set(dto.answers.map((a) => a.questionId))];
    const questions = await this.questionRepository.find({
      where: { id: In(questionIds), isActive: true },
      relations: ['options', 'options.label'],
    });
    if (questions.length !== questionIds.length) {
      throw new BadRequestException('Một hoặc nhiều câu hỏi không hợp lệ');
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
        throw new BadRequestException(`Mã nhãn không xác định: ${code}`);
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
            `Mã nhãn ${code} không phải là lựa chọn đang hoạt động cho câu hỏi ${question.code}`,
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

    return this.getSurveyForActor(actor, surveyId);
  }

  async completeSurvey(
    actor: SurveyActor,
    surveyId: string,
  ): Promise<SurveyResponseDto> {
    const { customer, survey } = await this.getOwnedInProgressSurvey(
      actor,
      surveyId,
    );

    const answerCount = await this.answerRepository.count({
      where: { surveyId: survey.id },
    });
    if (answerCount < 1) {
      throw new BadRequestException(
        'Khảo sát phải có ít nhất một câu trả lời trước khi hoàn thành',
      );
    }

    survey.isCompleted = true;
    survey.completedAt = new Date();
    await this.surveyRepository.save(survey);

    await this.deriveAndSaveSkinType(customer.id, survey.id);

    return this.getSurveyForActor(actor, surveyId);
  }

  public async deriveAndSaveSkinType(customerId: string, surveyId: string) {
    const surveyWithAnswers = await this.surveyRepository.findOne({
      where: { id: surveyId, customerId },
      relations: [
        'answers',
        'answers.answerLabels',
        'answers.answerLabels.label',
      ],
    });
    if (!surveyWithAnswers) {
      throw new NotFoundException(
        `Không tìm thấy khảo sát ${surveyId} cho khách hàng ${customerId}`,
      );
    }

    const labelCodes = new Set<string>();
    for (const answer of surveyWithAnswers.answers ?? []) {
      for (const al of answer.answerLabels ?? []) {
        if (al.label?.code && al.label.isActive) {
          labelCodes.add(al.label.code.trim());
        }
      }
    }

    // 1. Oily vs Dry (O vs D)
    let oilyScore = 0;
    let dryScore = 0;
    if (labelCodes.has('OILY_TENDENCY')) oilyScore += 40;
    if (labelCodes.has('COMBINATION_TENDENCY')) oilyScore += 20;
    if (labelCodes.has('OIL_CONTROL')) oilyScore += 30;
    if (labelCodes.has('ACNE')) oilyScore += 25;
    if (labelCodes.has('BLACKHEADS')) oilyScore += 20;
    if (labelCodes.has('ENLARGED_PORES')) oilyScore += 25;

    if (labelCodes.has('DRY_TENDENCY')) dryScore += 40;
    if (labelCodes.has('DEHYDRATED_SKIN')) dryScore += 30;
    if (labelCodes.has('HYDRATION')) dryScore += 25;
    if (labelCodes.has('BARRIER_DAMAGE')) dryScore += 20;
    if (labelCodes.has('ROUGH_TEXTURE')) dryScore += 15;
    if (labelCodes.has('FINE_LINES')) dryScore += 10;

    const oilyLetter = oilyScore >= dryScore ? 'O' : 'D';

    // 2. Sensitive vs Resistant (S vs R) - BR-03 tie-break: R when unclear
    let sensitiveScore = 0;
    if (labelCodes.has('SENSITIVE_TENDENCY')) sensitiveScore += 40;
    if (labelCodes.has('REDNESS') || labelCodes.has('REDUCE_REDNESS'))
      sensitiveScore += 30;
    if (labelCodes.has('ROSACEA')) sensitiveScore += 40;
    if (labelCodes.has('BARRIER_DAMAGE') || labelCodes.has('BARRIER_REPAIR'))
      sensitiveScore += 30;
    if (labelCodes.has('ACTIVE_IRRITATION')) sensitiveScore += 25;
    if (labelCodes.has('RESISTANT_TENDENCY')) sensitiveScore -= 20;

    const allergyLabels = [
      'FRAGRANCE',
      'ALCOHOL',
      'ESSENTIAL_OIL',
      'SALICYLIC_ACID',
      'BENZOYL_PEROXIDE',
      'RETINOIDS',
      'VITAMIN_C',
      'NIACINAMIDE',
    ];
    for (const alg of allergyLabels) {
      if (labelCodes.has(alg)) sensitiveScore += 15;
    }
    const sensitiveLetter = sensitiveScore > 0 ? 'S' : 'R';

    // 3. Pigmented vs Non-pigmented (P vs N) - BR-03 tie-break: N when unclear
    let pigmentedScore = 0;
    if (labelCodes.has('PIGMENTED_TENDENCY')) pigmentedScore += 40;
    if (
      labelCodes.has('HYPERPIGMENTATION') ||
      labelCodes.has('REDUCE_PIGMENTATION')
    )
      pigmentedScore += 30;
    if (labelCodes.has('MELASMA') || labelCodes.has('FRECKLES'))
      pigmentedScore += 30;
    if (
      labelCodes.has('POST_INFLAMMATORY_HYPERPIGMENTATION') ||
      labelCodes.has('POST_INFLAMMATORY_ERYTHEMA')
    )
      pigmentedScore += 25;
    if (
      labelCodes.has('BRIGHTENING') ||
      labelCodes.has('UNEVEN_SKIN_TONE') ||
      labelCodes.has('EVEN_SKIN_TONE')
    )
      pigmentedScore += 20;
    if (labelCodes.has('NON_PIGMENTED_TENDENCY')) pigmentedScore -= 20;
    const pigmentedLetter = pigmentedScore > 0 ? 'P' : 'N';

    // 4. Wrinkled vs Tight (W vs T) - BR-03 tie-break: T when unclear
    let wrinkledScore = 0;
    if (labelCodes.has('WRINKLED_TENDENCY')) wrinkledScore += 40;
    if (labelCodes.has('WRINKLES') || labelCodes.has('REDUCE_WRINKLES'))
      wrinkledScore += 40;
    if (labelCodes.has('FINE_LINES') || labelCodes.has('ANTI_AGING'))
      wrinkledScore += 25;
    if (labelCodes.has('AGE_36_45')) wrinkledScore += 15;
    if (labelCodes.has('AGE_46_60') || labelCodes.has('ABOVE_60'))
      wrinkledScore += 30;
    if (labelCodes.has('TIGHT_TENDENCY')) wrinkledScore -= 20;
    const wrinkledLetter = wrinkledScore > 0 ? 'W' : 'T';

    const baumannCode = `${oilyLetter}${sensitiveLetter}${pigmentedLetter}${wrinkledLetter}`;
    let skinType = await this.skinTypeRepository.findOne({
      where: { code: baumannCode },
    });
    if (!skinType) {
      skinType = await this.skinTypeRepository.findOne({
        where: { code: 'ORNT' },
      });
    }

    let details = await this.customerSkinTypeDetailsRepository.findOne({
      where: { customerId },
      relations: ['skinType'],
    });
    if (!details) {
      details = this.customerSkinTypeDetailsRepository.create({ customerId });
    }
    details.skinTypeId = skinType?.id ?? null;
    details.skinType = skinType ?? null;
    details.oilyDryScore = oilyScore - dryScore;
    details.sensitiveResistantScore = sensitiveScore;
    details.pigmentedNonPigmentedScore = pigmentedScore;
    details.wrinkledTightScore = wrinkledScore;
    details.assessedAt = new Date();

    return this.customerSkinTypeDetailsRepository.save(details);
  }

  async adminUpdateSurveyByCustomerId(
    customerId: string,
    answersInput: { questionCode: string; labelCodes: string[] }[],
  ): Promise<SurveyResponseDto> {
    const customer = await this.customerRepository.findOne({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException(`Không tìm thấy khách hàng ${customerId}`);
    }

    const survey = await this.surveyRepository.findOne({
      where: { customerId: customer.id },
      order: { completedAt: 'DESC', createdAt: 'DESC' },
    });
    if (!survey) {
      throw new NotFoundException(
        `Không tìm thấy khảo sát cho khách hàng ${customerId}`,
      );
    }

    for (const input of answersInput) {
      const question = await this.questionRepository.findOne({
        where: { code: input.questionCode.trim(), isActive: true },
        relations: ['options', 'options.label'],
      });
      if (!question) {
        throw new BadRequestException(
          `Mã câu hỏi đang hoạt động không xác định: ${input.questionCode}`,
        );
      }
      const allowedCodes = new Set(
        (question.options ?? [])
          .filter((o) => o.isActive && o.label?.isActive)
          .map((o) => o.label.code.trim()),
      );
      for (const code of input.labelCodes) {
        if (!allowedCodes.has(code.trim())) {
          throw new BadRequestException(
            `Mã nhãn ${code} không phải là lựa chọn hợp lệ cho câu hỏi ${input.questionCode}`,
          );
        }
      }
    }

    await this.answerRepository.delete({ surveyId: survey.id });

    for (const input of answersInput) {
      const question = await this.questionRepository.findOneOrFail({
        where: { code: input.questionCode.trim() },
      });
      const answer = await this.answerRepository.save(
        this.answerRepository.create({
          surveyId: survey.id,
          questionId: question.id,
        }),
      );

      if (input.labelCodes.length > 0) {
        const labels = await this.labelRepository.find({
          where: { code: In(input.labelCodes.map((c) => c.trim())) },
        });
        for (const label of labels) {
          await this.answerLabelRepository.save(
            this.answerLabelRepository.create({
              answerId: answer.id,
              labelId: label.id,
            }),
          );
        }
      }
    }

    if (!survey.isCompleted) {
      survey.isCompleted = true;
      survey.completedAt = new Date();
      await this.surveyRepository.save(survey);
    }

    await this.deriveAndSaveSkinType(customer.id, survey.id);

    await this.surveyRecommendationRepository.delete({
      customerSurveyId: survey.id,
    });

    const answers = await this.answerRepository.find({
      where: { surveyId: survey.id },
      relations: ['answerLabels', 'answerLabels.label'],
    });
    const faceLabels = await this.surveyFaceLabelRepository.find({
      where: { surveyId: survey.id },
      relations: ['label'],
    });
    return this.toSurveyDto(survey, answers, faceLabels);
  }

  async getSurveyForUser(
    userId: string,
    surveyId: string,
  ): Promise<SurveyResponseDto> {
    return this.getSurveyForActor({ kind: 'user', userId }, surveyId);
  }

  async getSurveyForActor(
    actor: SurveyActor,
    surveyId: string,
  ): Promise<SurveyResponseDto> {
    const customer = await this.resolveCustomer(actor);
    const survey = await this.surveyRepository.findOne({
      where: { id: surveyId, customerId: customer.id },
      relations: [
        'answers',
        'answers.answerLabels',
        'answers.answerLabels.label',
        'faceLabels',
        'faceLabels.label',
      ],
    });
    if (!survey) {
      throw new NotFoundException(`Không tìm thấy khảo sát ${surveyId}`);
    }
    return this.toSurveyDto(
      survey,
      survey.answers ?? [],
      survey.faceLabels ?? [],
    );
  }

  /**
   * Merge a guest Customer (surveys, recommendations, skin type, allergies,
   * profile fields) into the authenticated Customer's account.
   */
  async claimGuestSurvey(
    userId: string,
    guestToken: string,
  ): Promise<SurveyResponseDto | null> {
    const token = guestToken?.trim();
    if (!token) {
      throw new BadRequestException('guestToken là bắt buộc');
    }

    const guest = await this.findGuestCustomerByToken(token);
    const authCustomer = await this.getOrCreateCustomerByUserId(userId);

    if (guest.id === authCustomer.id) {
      throw new BadRequestException(
        'Khảo sát khách đã thuộc về người dùng này',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .update(CustomerSurvey)
        .set({ customerId: authCustomer.id })
        .where('"customerId" = :guestId', { guestId: guest.id })
        .execute();

      await manager
        .createQueryBuilder()
        .update(SurveyRecommendation)
        .set({ customerId: authCustomer.id })
        .where('"customerId" = :guestId', { guestId: guest.id })
        .execute();

      const authSkin = await manager.findOne(CustomerSkinTypeDetails, {
        where: { customerId: authCustomer.id },
      });
      const guestSkin = await manager.findOne(CustomerSkinTypeDetails, {
        where: { customerId: guest.id },
      });
      if (guestSkin) {
        if (!authSkin) {
          guestSkin.customerId = authCustomer.id;
          await manager.save(guestSkin);
        } else {
          await manager.remove(guestSkin);
        }
      }

      const guestAllergies = await manager.find(CustomerAllergy, {
        where: { customerId: guest.id },
      });
      if (guestAllergies.length > 0) {
        const authAllergies = await manager.find(CustomerAllergy, {
          where: { customerId: authCustomer.id },
        });
        const existingLabelIds = new Set(
          authAllergies.map((row) => row.labelId),
        );
        const toInsert = guestAllergies.filter(
          (row) => !existingLabelIds.has(row.labelId),
        );
        if (toInsert.length > 0) {
          await manager.save(
            toInsert.map((row) =>
              manager.create(CustomerAllergy, {
                customerId: authCustomer.id,
                labelId: row.labelId,
              }),
            ),
          );
        }
        await manager.delete(CustomerAllergy, { customerId: guest.id });
      }

      let profileDirty = false;
      if (!authCustomer.phone && guest.phone) {
        authCustomer.phone = guest.phone;
        profileDirty = true;
      }
      if (!authCustomer.dateOfBirth && guest.dateOfBirth) {
        authCustomer.dateOfBirth = guest.dateOfBirth;
        profileDirty = true;
      }
      if (
        authCustomer.gender === Gender.NOT_PREFER_TO_SAY &&
        guest.gender !== Gender.NOT_PREFER_TO_SAY
      ) {
        authCustomer.gender = guest.gender;
        profileDirty = true;
      }
      if (profileDirty) {
        await manager.save(authCustomer);
      }

      await manager.delete(Customer, { id: guest.id });
    });

    const latest = await this.surveyRepository.findOne({
      where: { customerId: authCustomer.id },
      order: { completedAt: 'DESC', createdAt: 'DESC' },
    });
    if (!latest) {
      return null;
    }
    return this.getSurveyForUser(userId, latest.id);
  }

  private async requireQuestionWithOptions(id: string): Promise<Question> {
    const question = await this.questionRepository.findOne({
      where: { id },
      relations: ['options', 'options.label'],
    });
    if (!question) throw new NotFoundException(`Không tìm thấy câu hỏi ${id}`);
    return question;
  }

  private async resolveOptionLabels(
    options: AdminQuestionOptionInputDto[],
  ): Promise<Map<string, Label>> {
    const codes = options.map((option) => option.labelCode.trim());
    if (new Set(codes).size !== codes.length) {
      throw new BadRequestException(
        'Mã nhãn lựa chọn câu hỏi phải là duy nhất',
      );
    }
    const labels = await this.labelRepository.find({
      where: { code: In(codes), isActive: true },
    });
    const labelByCode = new Map(labels.map((label) => [label.code, label]));
    for (const code of codes) {
      if (!labelByCode.has(code)) {
        throw new BadRequestException(
          `Mã nhãn đang hoạt động không xác định: ${code}`,
        );
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
          vietnameseNormalized: option.label.vietnameseNormalized ?? null,
        })),
    };
  }

  private async getOwnedInProgressSurvey(
    actor: SurveyActor,
    surveyId: string,
  ): Promise<{ customer: Customer; survey: CustomerSurvey }> {
    const customer = await this.resolveCustomer(actor);
    const survey = await this.surveyRepository.findOne({
      where: { id: surveyId, customerId: customer.id },
    });
    if (!survey) {
      throw new NotFoundException(`Không tìm thấy khảo sát ${surveyId}`);
    }
    if (survey.isCompleted) {
      throw new BadRequestException('Khảo sát đã hoàn thành');
    }
    return { customer, survey };
  }

  async resolveCustomer(actor: SurveyActor): Promise<Customer> {
    if (actor.kind === 'user') {
      return this.requireCustomer(actor.userId);
    }
    return this.findGuestCustomerByToken(actor.guestToken);
  }

  private async findGuestCustomerByToken(
    guestToken: string,
  ): Promise<Customer> {
    const customer = await this.customerRepository.findOne({
      where: {
        guestTokenHash: hashGuestToken(guestToken),
        userId: IsNull(),
      },
    });
    if (!customer) {
      throw new UnauthorizedException('Token khách không hợp lệ');
    }
    if (
      customer.guestExpiresAt &&
      customer.guestExpiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Token khách đã hết hạn');
    }
    return customer;
  }

  private async applyOptionalProfile(
    customer: Customer,
    dto: StartSurveyDto,
  ): Promise<void> {
    let dirty = false;
    if (dto.dateOfBirth !== undefined) {
      const dob = new Date(dto.dateOfBirth);
      if (dob > new Date()) {
        throw new BadRequestException(
          'dateOfBirth không được ở trong tương lai',
        );
      }
      customer.dateOfBirth = dob;
      dirty = true;
    }
    if (dto.gender !== undefined) {
      customer.gender = dto.gender;
      dirty = true;
    }
    if (dto.phone !== undefined) {
      customer.phone = dto.phone;
      dirty = true;
    }
    if (dirty) {
      await this.customerRepository.save(customer);
    }
    if (dto.allergyCodes !== undefined) {
      await this.replaceAllergies(customer.id, dto.allergyCodes);
    }
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

    await this.customerAllergyRepository.delete({ customerId });
    if (allergyLabels.length > 0) {
      await this.customerAllergyRepository.save(
        allergyLabels.map((label) =>
          this.customerAllergyRepository.create({
            customerId,
            labelId: label.id,
          }),
        ),
      );
    }
  }

  private async requireCustomer(userId: string): Promise<Customer> {
    const customer = await this.customerRepository.findOne({
      where: { userId },
    });
    if (!customer) {
      throw new ForbiddenException(
        'Không có hồ sơ khách hàng cho người dùng này',
      );
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
      this.customerRepository.create({
        userId,
        guestTokenHash: null,
        guestExpiresAt: null,
      }),
    );
  }

  private toSurveyDto(
    survey: CustomerSurvey,
    answers: Answer[],
    faceLabels: SurveyFaceLabel[] = [],
  ): SurveyResponseDto {
    return {
      id: survey.id,
      isCompleted: survey.isCompleted,
      completedAt: survey.completedAt,
      faceImageUrl: survey.faceImageUrl ?? null,
      faceScannedAt: survey.faceScannedAt ?? null,
      faceLabels: (faceLabels ?? [])
        .filter((fl) => fl.label)
        .map((fl) => ({
          code: fl.label.code,
          name: fl.label.name,
          vietnameseNormalized: fl.label.vietnameseNormalized ?? null,
          explanation: fl.explanation ?? null,
        })),
      createdAt: survey.createdAt,
      answers: (answers ?? []).map((a) => ({
        id: a.id,
        questionId: a.questionId,
        value: a.value,
        labels: (a.answerLabels ?? []).map((al) => ({
          code: al.label.code,
          name: al.label.name,
          vietnameseNormalized: al.label.vietnameseNormalized ?? null,
        })),
      })),
    };
  }
}
