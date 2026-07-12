import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { Role } from '../auth/roles.enum';
import { getAuthContext } from '../auth/auth-context';
import { SubmitAnswersDto } from './dto/submit-answers.dto';
import {
  SurveyQuestionDto,
  SurveyResponseDto,
} from './dto/survey-response.dto';
import { SurveyService } from './survey.service';

@ApiTags('Surveys')
@Controller('surveys')
@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class SurveysController {
  constructor(private readonly surveyService: SurveyService) {}

  @Get('questions')
  @Roles(Role.Customer)
  @ApiOperation({ summary: 'List active survey questions' })
  @ApiOkResponse({ type: [SurveyQuestionDto] })
  listQuestions(): Promise<SurveyQuestionDto[]> {
    return this.surveyService.listQuestions();
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
