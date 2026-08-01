import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { getAuthContext } from '../auth/auth-context';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { Role } from '../auth/roles.enum';
import { Routine } from '../routines/routine.entity';
import {
  TreatmentChartResponseDto,
  TreatmentEventResponseDto,
} from './dto/treatment-chart-response.dto';
import {
  ProductCandidateDto,
  TreatmentPhaseResponseDto,
  TreatmentResponseDto,
} from './dto/treatment-response.dto';
import {
  CancelTreatmentDto,
  CreateTreatmentDto,
  CreateTreatmentEventDto,
  CreateTreatmentPhaseDto,
  SetPhaseIngredientsDto,
  SetPhaseProductsDto,
  UpdateExpertRoutineDto,
  UpdateTreatmentEventPhotoDto,
  UpdateTreatmentPhaseDto,
} from './dto/treatment.dto';
import { TreatmentEventType } from './enums';
import { TreatmentsService } from './treatments.service';

@ApiTags('Treatments')
@Controller('treatments')
@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class TreatmentsController {
  constructor(private readonly treatmentsService: TreatmentsService) {}

  @Post()
  @Roles(Role.Expert)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a DRAFT treatment plan',
    description:
      'Typically created during an IN_PROGRESS consultation after video/chat intake. Optional sourceConsultationId must be IN_PROGRESS or COMPLETED.',
  })
  @ApiCreatedResponse({ type: TreatmentResponseDto })
  create(@Req() req: Request, @Body() dto: CreateTreatmentDto) {
    return this.treatmentsService.createTreatment(this.requireUserId(req), dto);
  }

  @Get('me')
  @Roles(Role.Customer, Role.Expert)
  @ApiOperation({ summary: 'List my treatments' })
  @ApiQuery({
    name: 'as',
    required: false,
    enum: ['customer', 'expert'],
  })
  @ApiOkResponse({ type: [TreatmentResponseDto] })
  listMine(@Req() req: Request, @Query('as') as?: 'customer' | 'expert') {
    const auth = getAuthContext(req);
    if (!auth?.userId) throw new UnauthorizedException('Not authenticated');
    const roles = auth.roles ?? [];
    const asExpert =
      as === 'expert' ||
      (!as && roles.includes(Role.Expert) && !roles.includes(Role.Customer));
    return this.treatmentsService.listMyTreatments(auth.userId, asExpert);
  }

  @Get(':id/chart')
  @Roles(Role.Customer, Role.Expert)
  @ApiOperation({
    summary: 'Treatment chart (hồ sơ bệnh án) while plan is in progress',
    description:
      'Aggregates progress photos, products used from routine completions, in-person sessions, and consultation results. Readable by owning customer, assigned expert, or an expert with a CONFIRMED/IN_PROGRESS booking for the same customer (read-only).',
  })
  @ApiOkResponse({ type: TreatmentChartResponseDto })
  getChart(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const auth = getAuthContext(req);
    if (!auth?.userId) throw new UnauthorizedException('Not authenticated');
    const roles = auth.roles ?? [];
    return this.treatmentsService.getChart(
      auth.userId,
      {
        isExpert: roles.includes(Role.Expert),
        isCustomer: roles.includes(Role.Customer),
      },
      id,
    );
  }

  @Get(':id/events')
  @Roles(Role.Customer, Role.Expert)
  @ApiOperation({
    summary: 'List treatment timeline events',
    description:
      'Readable by owning customer, assigned expert, or an expert with a CONFIRMED/IN_PROGRESS booking for the same customer.',
  })
  @ApiQuery({ name: 'type', required: false, enum: TreatmentEventType })
  @ApiOkResponse({ type: [TreatmentEventResponseDto] })
  listEvents(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('type') type?: TreatmentEventType,
  ) {
    const auth = getAuthContext(req);
    if (!auth?.userId) throw new UnauthorizedException('Not authenticated');
    const roles = auth.roles ?? [];
    return this.treatmentsService.listEvents(
      auth.userId,
      {
        isExpert: roles.includes(Role.Expert),
        isCustomer: roles.includes(Role.Customer),
      },
      id,
      type,
    );
  }

  @Post(':id/events')
  @Roles(Role.Customer, Role.Expert)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a treatment event (e.g. progress photo)',
    description:
      'PROGRESS_PHOTO requires photoUrl. Upload via POST /uploads/images first, then pass the returned URL. Only owning customer or assigned expert may create events.',
  })
  @ApiCreatedResponse({ type: TreatmentEventResponseDto })
  createEvent(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTreatmentEventDto,
  ) {
    const auth = getAuthContext(req);
    if (!auth?.userId) throw new UnauthorizedException('Not authenticated');
    const roles = auth.roles ?? [];
    return this.treatmentsService.createEvent(
      auth.userId,
      {
        isExpert: roles.includes(Role.Expert),
        isCustomer: roles.includes(Role.Customer),
      },
      id,
      dto,
    );
  }

  @Patch(':id/events/:eventId')
  @Roles(Role.Customer, Role.Expert)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update PROGRESS_PHOTO event photo URL',
    description:
      'Replaces photoUrl on a PROGRESS_PHOTO event. Upload via POST /uploads/images first. Only owning customer or assigned expert may update events.',
  })
  @ApiOkResponse({ type: TreatmentEventResponseDto })
  updateEventPhoto(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: UpdateTreatmentEventPhotoDto,
  ) {
    const auth = getAuthContext(req);
    if (!auth?.userId) throw new UnauthorizedException('Not authenticated');
    const roles = auth.roles ?? [];
    return this.treatmentsService.updateEventPhoto(
      auth.userId,
      {
        isExpert: roles.includes(Role.Expert),
        isCustomer: roles.includes(Role.Customer),
      },
      id,
      eventId,
      dto.photoUrl,
    );
  }

  @Post(':id/cancel')
  @Roles(Role.Customer, Role.Expert)
  @ApiOperation({
    summary: 'Cancel an ACTIVE/PAUSED treatment mid-plan',
    description:
      'Refunds sum of PENDING phase fees to wallet. COMPLETED and ACTIVE phase fees are kept. Linked ACTIVE routines are paused.',
  })
  @ApiOkResponse({ type: TreatmentResponseDto })
  @ApiBadRequestResponse({
    description: 'Not cancellable or already cancelled',
  })
  cancel(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelTreatmentDto,
  ) {
    const auth = getAuthContext(req);
    if (!auth?.userId) throw new UnauthorizedException('Not authenticated');
    const roles = auth.roles ?? [];
    return this.treatmentsService.cancelTreatment(
      auth.userId,
      {
        isExpert: roles.includes(Role.Expert),
        isCustomer: roles.includes(Role.Customer),
      },
      id,
      dto,
    );
  }

  @Get(':id')
  @Roles(Role.Customer, Role.Expert)
  @ApiOperation({
    summary: 'Get treatment detail',
    description:
      'Readable by owning customer, assigned expert, or an expert with a CONFIRMED/IN_PROGRESS booking for the same customer (read-only).',
  })
  @ApiOkResponse({ type: TreatmentResponseDto })
  getOne(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const auth = getAuthContext(req);
    if (!auth?.userId) throw new UnauthorizedException('Not authenticated');
    const roles = auth.roles ?? [];
    return this.treatmentsService.getTreatmentForUser(auth.userId, id, {
      isExpert: roles.includes(Role.Expert),
      isCustomer: roles.includes(Role.Customer),
    });
  }

  @Post(':id/phases')
  @Roles(Role.Expert)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a phase to a DRAFT treatment' })
  @ApiCreatedResponse({ type: TreatmentPhaseResponseDto })
  addPhase(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTreatmentPhaseDto,
  ) {
    return this.treatmentsService.addPhase(this.requireUserId(req), id, dto);
  }

  @Patch('phases/:phaseId')
  @Roles(Role.Expert)
  @ApiOperation({ summary: 'Update a DRAFT treatment phase' })
  @ApiOkResponse({ type: TreatmentPhaseResponseDto })
  updatePhase(
    @Req() req: Request,
    @Param('phaseId', ParseUUIDPipe) phaseId: string,
    @Body() dto: UpdateTreatmentPhaseDto,
  ) {
    return this.treatmentsService.updatePhase(
      this.requireUserId(req),
      phaseId,
      dto,
    );
  }

  @Delete('phases/:phaseId')
  @Roles(Role.Expert)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a DRAFT treatment phase' })
  deletePhase(
    @Req() req: Request,
    @Param('phaseId', ParseUUIDPipe) phaseId: string,
  ) {
    return this.treatmentsService.deletePhase(this.requireUserId(req), phaseId);
  }

  @Post(':id/submit')
  @Roles(Role.Expert)
  @ApiOperation({
    summary: 'Finalize plan totals for customer payment',
    description:
      'Sets submittedAt and totalPriceVnd from phases. Requires noteByExpert on every phase. Treatment remains DRAFT until customer pays. Phase edits clear submittedAt until re-submit.',
  })
  @ApiOkResponse({ type: TreatmentResponseDto })
  submit(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.treatmentsService.submitForPayment(this.requireUserId(req), id);
  }

  @Post(':id/pay')
  @Roles(Role.Customer)
  @ApiOperation({
    summary: 'Pay whole treatment plan from wallet',
    description:
      'Requires expert submit (submittedAt). Debits sum of phase prices once; activates treatment. Pricing locked after pay.',
  })
  @ApiOkResponse({ type: TreatmentResponseDto })
  @ApiBadRequestResponse({ description: 'Insufficient balance or not payable' })
  pay(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.treatmentsService.payTreatment(this.requireUserId(req), id);
  }

  @Post('phases/:phaseId/ingredients')
  @Roles(Role.Expert)
  @ApiOperation({ summary: 'Set expert-selected ingredients for a paid phase' })
  @ApiOkResponse({ type: TreatmentPhaseResponseDto })
  setIngredients(
    @Req() req: Request,
    @Param('phaseId', ParseUUIDPipe) phaseId: string,
    @Body() dto: SetPhaseIngredientsDto,
  ) {
    return this.treatmentsService.setPhaseIngredients(
      this.requireUserId(req),
      phaseId,
      dto,
    );
  }

  @Get('phases/:phaseId/product-candidates')
  @Roles(Role.Expert)
  @ApiOperation({
    summary: 'List products ranked by selected ingredient overlap',
  })
  @ApiOkResponse({ type: [ProductCandidateDto] })
  productCandidates(
    @Req() req: Request,
    @Param('phaseId', ParseUUIDPipe) phaseId: string,
  ) {
    return this.treatmentsService.listProductCandidates(
      this.requireUserId(req),
      phaseId,
    );
  }

  @Post('phases/:phaseId/products')
  @Roles(Role.Expert)
  @ApiOperation({ summary: 'Set selected product variants for a phase' })
  @ApiOkResponse({ type: TreatmentPhaseResponseDto })
  setProducts(
    @Req() req: Request,
    @Param('phaseId', ParseUUIDPipe) phaseId: string,
    @Body() dto: SetPhaseProductsDto,
  ) {
    return this.treatmentsService.setPhaseProducts(
      this.requireUserId(req),
      phaseId,
      dto,
    );
  }

  @Post('phases/:phaseId/routines/generate')
  @Roles(Role.Expert)
  @ApiOperation({
    summary: 'Generate EXPERT_PRESCRIBED routine from selected products',
    description: 'Protocol-based (no LLM). Saves as DRAFT until save/activate.',
  })
  generateRoutine(
    @Req() req: Request,
    @Param('phaseId', ParseUUIDPipe) phaseId: string,
  ): Promise<Routine> {
    return this.treatmentsService.generateRoutine(
      this.requireUserId(req),
      phaseId,
    );
  }

  @Post('routines/:routineId/save')
  @Roles(Role.Expert)
  @ApiOperation({
    summary: 'Save DRAFT routine (DRAFT → ACTIVE entity status)',
  })
  saveRoutine(
    @Req() req: Request,
    @Param('routineId', ParseUUIDPipe) routineId: string,
  ): Promise<Routine> {
    return this.treatmentsService.saveRoutineDraft(
      this.requireUserId(req),
      routineId,
    );
  }

  @Patch('routines/:routineId')
  @Roles(Role.Expert)
  @ApiOperation({
    summary: 'Edit expert routine (allowed after phase activate in MVP)',
  })
  updateRoutine(
    @Req() req: Request,
    @Param('routineId', ParseUUIDPipe) routineId: string,
    @Body() dto: UpdateExpertRoutineDto,
  ): Promise<Routine> {
    return this.treatmentsService.updateRoutine(
      this.requireUserId(req),
      routineId,
      dto,
    );
  }

  @Post('phases/:phaseId/activate')
  @Roles(Role.Expert)
  @ApiOperation({
    summary: 'Activate a phase (auto-completes previous ACTIVE phase)',
  })
  @ApiOkResponse({ type: TreatmentPhaseResponseDto })
  @ApiForbiddenResponse({ description: 'Not assigned expert' })
  @ApiNotFoundResponse({ description: 'Phase not found' })
  activate(
    @Req() req: Request,
    @Param('phaseId', ParseUUIDPipe) phaseId: string,
  ) {
    return this.treatmentsService.activatePhase(
      this.requireUserId(req),
      phaseId,
    );
  }

  private requireUserId(req: Request): string {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Not authenticated');
    }
    return auth.userId;
  }
}
