import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { getAuthContext } from '../auth/auth-context';
import { SessionGuard } from '../auth/guards/session.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../auth/roles.enum';
import { CallerContext } from '../users/users.service';
import { CreateExpertDto } from './dto/create-expert.dto';
import { UpdateExpertDto } from './dto/update-expert.dto';
import { UpdateOwnExpertAvatarDto } from './dto/update-own-expert-avatar.dto';
import { UpsertExpertConsultationFeeDto } from './dto/upsert-expert-consultation-fee.dto';
import { ListExpertsQueryDto } from './dto/list-experts.dto';
import { ListExpertFeedbacksQueryDto } from './dto/list-expert-feedbacks.dto';
import { PaginatedExpertFeedbacksDto } from './dto/expert-feedback-response.dto';
import {
  ExpertResponseDto,
  PaginatedExpertsDto,
} from './dto/expert-response.dto';
import { ExpertsService } from './experts.service';

@ApiTags('Experts')
@Controller('experts')
@ApiCookieAuth()
@ApiBearerAuth()
export class ExpertsController {
  constructor(private readonly expertsService: ExpertsService) {}

  @Get()
  @ApiOperation({
    summary: 'List available experts',
    description:
      'Public. Filter by specialization, rating, consultation fee, and distance from client location.',
  })
  @ApiOkResponse({ type: PaginatedExpertsDto })
  list(@Query() query: ListExpertsQueryDto) {
    return this.expertsService.findMany(query);
  }

  @Post()
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(Role.AppAdmin, Role.ClinicManager)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create expert profile',
    description:
      'Creates a clinic-bound expert profile for an existing user with the expert role. clinicId is required.',
  })
  @ApiCreatedResponse({ type: ExpertResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  @ApiConflictResponse({ description: 'Expert profile already exists' })
  @ApiNotFoundResponse({ description: 'User or clinic not found' })
  create(@Req() req: Request, @Body() body: CreateExpertDto) {
    return this.expertsService.create(this.buildCallerContext(req), body);
  }

  @Get('me')
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(Role.Expert)
  @ApiOperation({
    summary: 'Get own expert profile',
    description:
      'Returns the clinic-bound expert profile for the authenticated expert.',
  })
  @ApiOkResponse({ type: ExpertResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  @ApiNotFoundResponse({ description: 'Expert profile not found' })
  getMe(@Req() req: Request) {
    return this.expertsService.getOwnProfile(this.requireUserId(req));
  }

  @Patch('me')
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(Role.Expert)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update own expert avatar URL',
    description:
      'Sets avatarUrl on the authenticated expert profile (typically after POST /uploads/images).',
  })
  @ApiOkResponse({ type: ExpertResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  @ApiNotFoundResponse({ description: 'Expert profile not found' })
  updateMe(@Req() req: Request, @Body() body: UpdateOwnExpertAvatarDto) {
    return this.expertsService.updateOwnAvatar(
      this.requireUserId(req),
      body.avatarUrl,
    );
  }

  @Put('me/consultation-fee')
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(Role.Expert)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Upsert own consultation fee',
    description:
      'Sets the authenticated expert consultation fee in VND (create-or-replace on the profile field).',
  })
  @ApiOkResponse({ type: ExpertResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  @ApiNotFoundResponse({ description: 'Expert profile not found' })
  upsertOwnConsultationFee(
    @Req() req: Request,
    @Body() body: UpsertExpertConsultationFeeDto,
  ) {
    return this.expertsService.upsertOwnConsultationFee(
      this.requireUserId(req),
      body.consultationFee,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get expert by id',
    description: 'Public. Returns clinic-bound expert profile details.',
  })
  @ApiOkResponse({ type: ExpertResponseDto })
  @ApiNotFoundResponse({ description: 'Expert not found' })
  getById(@Param('id') id: string) {
    return this.expertsService.findOne(id);
  }

  @Get(':id/feedbacks')
  @UseGuards(SessionGuard)
  @ApiOperation({
    summary: 'Get feedbacks and ratings by expert id',
    description:
      'Returns paginated customer feedback for consultations with this expert, plus average rating and rating count.',
  })
  @ApiOkResponse({ type: PaginatedExpertFeedbacksDto })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiNotFoundResponse({ description: 'Expert not found' })
  getFeedbacks(
    @Param('id') id: string,
    @Query() query: ListExpertFeedbacksQueryDto,
  ) {
    return this.expertsService.findFeedbacksByExpertId(id, query);
  }

  @Put(':id/consultation-fee')
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(Role.Expert, Role.ClinicManager, Role.AppAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Upsert expert consultation fee',
    description:
      'Sets consultation fee in VND. Accessible by the expert themselves, their clinic manager, or an app admin.',
  })
  @ApiOkResponse({ type: ExpertResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  @ApiNotFoundResponse({ description: 'Expert not found' })
  upsertConsultationFee(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpsertExpertConsultationFeeDto,
  ) {
    return this.expertsService.upsertConsultationFee(
      this.buildCallerContext(req),
      id,
      body.consultationFee,
    );
  }

  @Patch(':id')
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(Role.AppAdmin, Role.ClinicManager)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update expert profile',
    description:
      'Updates expert profile fields. clinicId cannot be cleared; activation requires a clinic.',
  })
  @ApiOkResponse({ type: ExpertResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  @ApiNotFoundResponse({ description: 'Expert not found' })
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateExpertDto,
  ) {
    return this.expertsService.update(this.buildCallerContext(req), id, body);
  }

  private requireUserId(req: Request): string {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Chưa xác thực');
    }
    return auth.userId;
  }

  private buildCallerContext(req: Request): CallerContext {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Chưa xác thực');
    }
    return {
      userId: auth.userId,
      roles: (auth.roles?.length ? auth.roles : [Role.Customer]) as Role[],
      clinicId: auth.clinicId ?? null,
    };
  }
}
