import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { memoryStorage } from 'multer';
import { getAuthContext } from '../auth/auth-context';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { getGuestToken, type SurveyActor } from '../auth/guest-token';
import { Role } from '../auth/roles.enum';
import { SubmitAnswersDto } from './dto/submit-answers.dto';
import { ListSurveyQuestionsDto } from './dto/list-survey-questions.dto';
import { ClaimGuestSurveyDto, StartSurveyDto } from './dto/start-survey.dto';
import {
  SurveyQuestionDto,
  SurveyResponseDto,
} from './dto/survey-response.dto';
import { SurveyService } from './survey.service';

const MAX_FACE_IMAGE_BYTES = 5 * 1024 * 1024;

@ApiTags('Surveys')
@Controller('surveys')
@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class SurveysController {
  constructor(private readonly surveyService: SurveyService) {}

  @Get('questions')
  @Public()
  @Roles(Role.Customer)
  @ApiHeader({
    name: 'X-Guest-Token',
    required: false,
    description: 'Required with surveyId when not logged in',
  })
  @ApiOperation({
    summary: 'List active survey questions',
    description:
      'Without surveyId: public CORE questions. With surveyId: cumulative list (answered prefix + up to 10 unlocked unanswered). CONDITIONAL unlock from current labels even if some CORE are skipped; OPTIONAL only when no unlocked unanswered CONDITIONAL remain.',
  })
  @ApiOkResponse({ type: [SurveyQuestionDto] })
  listQuestions(
    @Req() req: Request,
    @Query() query: ListSurveyQuestionsDto,
  ): Promise<SurveyQuestionDto[]> {
    const actor = this.resolveOptionalActor(req);
    return this.surveyService.listQuestions(actor, query.surveyId);
  }

  @Post()
  @Public()
  @Roles(Role.Customer)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Start a new skincare survey session',
    description:
      'Authenticated customers start under their profile. Guests receive a guestToken to send as X-Guest-Token.',
  })
  @ApiCreatedResponse({ type: SurveyResponseDto })
  start(
    @Req() req: Request,
    @Body() body: StartSurveyDto = {},
  ): Promise<SurveyResponseDto> {
    const userId = getAuthContext(req)?.userId;
    if (userId) {
      return this.surveyService.startSurvey(userId, body ?? {});
    }
    return this.surveyService.startGuestSurvey(body ?? {});
  }

  @Post('claim')
  @Roles(Role.Customer)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Claim a guest survey into the authenticated customer account',
  })
  @ApiOkResponse({ type: SurveyResponseDto })
  claim(
    @Req() req: Request,
    @Body() body: ClaimGuestSurveyDto,
  ): Promise<SurveyResponseDto | null> {
    return this.surveyService.claimGuestSurvey(
      this.requireUserId(req),
      body.guestToken,
    );
  }

  @Get(':id')
  @Public()
  @Roles(Role.Customer)
  @ApiHeader({ name: 'X-Guest-Token', required: false })
  @ApiOperation({ summary: 'Get a survey session' })
  @ApiOkResponse({ type: SurveyResponseDto })
  getOne(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SurveyResponseDto> {
    return this.surveyService.getSurveyForActor(this.requireActor(req), id);
  }

  @Post(':id/answers')
  @Public()
  @Roles(Role.Customer)
  @ApiHeader({ name: 'X-Guest-Token', required: false })
  @ApiOperation({ summary: 'Submit or replace answers for a survey' })
  @ApiOkResponse({ type: SurveyResponseDto })
  submitAnswers(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SubmitAnswersDto,
  ): Promise<SurveyResponseDto> {
    return this.surveyService.submitAnswers(this.requireActor(req), id, body);
  }

  @Post(':id/face-scan')
  @Roles(Role.Customer)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FACE_IMAGE_BYTES },
    }),
  )
  @ApiOperation({
    summary: 'Upload facial image, persist it, and extract AI skin labels',
    description:
      'Logged-in customers only. Guests cannot use face-scan. Accepts multipart field `file` (jpeg/png/webp/gif/heic/heif, max 5MB).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOkResponse({ type: SurveyResponseDto })
  submitFaceScan(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_FACE_IMAGE_BYTES }),
        ],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
  ): Promise<SurveyResponseDto> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('file is required');
    }
    return this.surveyService.submitFaceScan(this.requireUserId(req), id, file);
  }

  @Post(':id/complete')
  @Public()
  @Roles(Role.Customer)
  @ApiHeader({ name: 'X-Guest-Token', required: false })
  @ApiOperation({ summary: 'Mark a survey as completed' })
  @ApiOkResponse({ type: SurveyResponseDto })
  complete(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SurveyResponseDto> {
    return this.surveyService.completeSurvey(this.requireActor(req), id);
  }

  private requireUserId(req: Request): string {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Not authenticated');
    }
    return auth.userId;
  }

  private requireActor(req: Request): SurveyActor {
    const actor = this.resolveOptionalActor(req);
    if (!actor) {
      throw new UnauthorizedException(
        'Not authenticated. Log in or send X-Guest-Token',
      );
    }
    return actor;
  }

  private resolveOptionalActor(req: Request): SurveyActor | null {
    const userId = getAuthContext(req)?.userId;
    if (userId) {
      return { kind: 'user', userId };
    }
    const guestToken = getGuestToken(req);
    if (guestToken) {
      return { kind: 'guest', guestToken };
    }
    return null;
  }
}
