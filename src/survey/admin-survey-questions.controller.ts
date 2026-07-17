import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { Role } from '../auth/roles.enum';
import {
  AdminSurveyQuestionDto,
  CreateSurveyQuestionDto,
  ReplaceQuestionOptionsDto,
  UpdateSurveyQuestionDto,
} from './dto/admin-survey-question.dto';
import { SurveyService } from './survey.service';

@ApiTags('Admin Survey Questions')
@Controller('admin/survey-questions')
@UseGuards(SessionGuard, RolesGuard)
@Roles(Role.AppAdmin)
@ApiCookieAuth()
@ApiBearerAuth()
export class AdminSurveyQuestionsController {
  constructor(private readonly surveyService: SurveyService) {}

  @Get()
  @ApiOperation({ summary: 'List survey question bank entries' })
  @ApiOkResponse({ type: [AdminSurveyQuestionDto] })
  list(
    @Query('activeOnly') activeOnly?: string,
  ): Promise<AdminSurveyQuestionDto[]> {
    return this.surveyService.listAdminQuestions(activeOnly === 'true');
  }

  @Get(':id')
  @ApiOkResponse({ type: AdminSurveyQuestionDto })
  getOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminSurveyQuestionDto> {
    return this.surveyService.getAdminQuestion(id);
  }

  @Post()
  @ApiCreatedResponse({ type: AdminSurveyQuestionDto })
  create(
    @Body() dto: CreateSurveyQuestionDto,
  ): Promise<AdminSurveyQuestionDto> {
    return this.surveyService.createAdminQuestion(dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: AdminSurveyQuestionDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSurveyQuestionDto,
  ): Promise<AdminSurveyQuestionDto> {
    return this.surveyService.updateAdminQuestion(id, dto);
  }

  @Put(':id/options')
  @ApiOkResponse({ type: AdminSurveyQuestionDto })
  replaceOptions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceQuestionOptionsDto,
  ): Promise<AdminSurveyQuestionDto> {
    return this.surveyService.replaceAdminQuestionOptions(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-deactivate a survey question' })
  @ApiOkResponse({ type: AdminSurveyQuestionDto })
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminSurveyQuestionDto> {
    return this.surveyService.deactivateAdminQuestion(id);
  }
}
