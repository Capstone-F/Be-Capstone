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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { memoryStorage } from 'multer';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { Role } from '../auth/roles.enum';
import { getAuthContext } from '../auth/auth-context';
import { SubmitAnswersDto } from './dto/submit-answers.dto';
import { ListSurveyQuestionsDto } from './dto/list-survey-questions.dto';
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
  @Roles(Role.Customer)
  @ApiOperation({ summary: 'List active survey questions' })
  @ApiOkResponse({ type: [SurveyQuestionDto] })
  listQuestions(
    @Req() req: Request,
    @Query() query: ListSurveyQuestionsDto,
  ): Promise<SurveyQuestionDto[]> {
    return this.surveyService.listQuestions(
      this.requireUserId(req),
      query.surveyId,
    );
  }

  @Post()
  @Roles(Role.Customer)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Start a new skincare survey session' })
  @ApiCreatedResponse({ type: SurveyResponseDto })
  start(@Req() req: Request): Promise<SurveyResponseDto> {
    return this.surveyService.startSurvey(this.requireUserId(req));
  }

  @Get(':id')
  @Roles(Role.Customer)
  @ApiOperation({ summary: 'Get a survey session' })
  @ApiOkResponse({ type: SurveyResponseDto })
  getOne(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SurveyResponseDto> {
    return this.surveyService.getSurveyForUser(this.requireUserId(req), id);
  }

  @Post(':id/answers')
  @Roles(Role.Customer)
  @ApiOperation({ summary: 'Submit or replace answers for a survey' })
  @ApiOkResponse({ type: SurveyResponseDto })
  submitAnswers(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SubmitAnswersDto,
  ): Promise<SurveyResponseDto> {
    return this.surveyService.submitAnswers(this.requireUserId(req), id, body);
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
      'Accepts multipart field `file` (jpeg/png/webp/gif, max 5MB). Uploads to R2, stores URL on the survey, runs the skin-vision provider (mock by default), and saves face labels for weighted recommendations.',
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
  @Roles(Role.Customer)
  @ApiOperation({ summary: 'Mark a survey as completed' })
  @ApiOkResponse({ type: SurveyResponseDto })
  complete(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SurveyResponseDto> {
    return this.surveyService.completeSurvey(this.requireUserId(req), id);
  }

  private requireUserId(req: Request): string {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Not authenticated');
    }
    return auth.userId;
  }
}
