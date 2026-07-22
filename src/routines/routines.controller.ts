import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
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
import { getAuthContext } from '../auth/auth-context';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { Role } from '../auth/roles.enum';
import { GenerateRoutineDto } from './dto/generate-routine.dto';
import { RoutineResponseDto } from './dto/routine-response.dto';
import {
  CheckInResponseDto,
  HistoryDayDetailResponseDto,
  RoutineHistoryResponseDto,
  TodayRoutineDto,
  TodayRoutinesResponseDto,
} from './dto/routine-tracking-response.dto';
import {
  CreateCheckInDto,
  DateRangeQueryDto,
  HistoryDayQueryDto,
  SkipStepDto,
  TodayQueryDto,
} from './dto/routine-tracking.dto';
import { RoutineGeneratorService } from './routine-generator.service';
import { RoutineTrackingService } from './routine-tracking.service';

@ApiTags('Routines')
@Controller('routines')
@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class RoutinesController {
  constructor(
    private readonly routineGeneratorService: RoutineGeneratorService,
    private readonly routineTrackingService: RoutineTrackingService,
  ) {}

  @Post('generate')
  @Roles(Role.Customer)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Generate an AI routine from a paid survey order',
    description:
      'Only PAID orders with source=SURVEY are eligible. Catalog purchases cannot generate routines. ' +
      'Each step includes product, dosage, wait time, and instructions for Today Routine / Step Detail.',
  })
  @ApiCreatedResponse({ type: RoutineResponseDto })
  generate(
    @Req() req: Request,
    @Body() body: GenerateRoutineDto,
  ): Promise<RoutineResponseDto> {
    return this.routineGeneratorService.generateForUser(
      this.requireUserId(req),
      body,
    );
  }

  @Get('me')
  @Roles(Role.Customer)
  @ApiOperation({
    summary: 'List my routines',
    description:
      'Returns all routines for the authenticated customer with enriched step detail ' +
      '(product, dosage, wait time). Steps are sorted MORNING then EVENING, then stepOrder.',
  })
  @ApiOkResponse({ type: [RoutineResponseDto] })
  listMine(@Req() req: Request): Promise<RoutineResponseDto[]> {
    return this.routineGeneratorService.listMyRoutines(this.requireUserId(req));
  }

  @Get('me/today')
  @Roles(Role.Customer)
  @ApiOperation({
    summary: "Today's routine sessions for Care Plan / Home",
    description:
      'Timezone: Asia/Ho_Chi_Minh (UTC+7). Period defaults by local hour (<14 → MORNING, else EVENING). ' +
      'Returns all ACTIVE routines for the period. Empty → sessionState EMPTY + reason NO_ACTIVE_ROUTINE. ' +
      'Per-routine sessionState: NOT_STARTED (0 acted), IN_PROGRESS (some acted), COMPLETED (every step COMPLETED or SKIPPED). ' +
      'completionRate = completedCount/totalCount (skips do not inflate %).',
  })
  @ApiOkResponse({ type: TodayRoutinesResponseDto })
  getToday(
    @Req() req: Request,
    @Query() query: TodayQueryDto,
  ): Promise<TodayRoutinesResponseDto> {
    return this.routineTrackingService.getToday(
      this.requireUserId(req),
      query.period,
    );
  }

  @Post(':routineId/steps/:stepId/complete')
  @Roles(Role.Customer)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark a routine step completed for today',
    description:
      'Records COMPLETED for the step on the current Asia/Ho_Chi_Minh date. ' +
      'Idempotent if already COMPLETED. Conflict (409) if already SKIPPED. ' +
      'Only ACTIVE routines owned by the caller.',
  })
  @ApiOkResponse({ type: TodayRoutineDto })
  @ApiConflictResponse({ description: 'Step already SKIPPED today' })
  @ApiForbiddenResponse({ description: 'Routine belongs to another customer' })
  @ApiNotFoundResponse({ description: 'Routine or step not found' })
  completeStep(
    @Req() req: Request,
    @Param('routineId', ParseUUIDPipe) routineId: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
  ): Promise<TodayRoutineDto> {
    return this.routineTrackingService.completeStep(
      this.requireUserId(req),
      routineId,
      stepId,
    );
  }

  @Post(':routineId/steps/:stepId/skip')
  @Roles(Role.Customer)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Skip a routine step for today',
    description:
      'Records SKIPPED with required reason (OUT_OF_STOCK | FORGOT | OTHER). ' +
      'note required when reason is OTHER. Idempotent if already SKIPPED with same outcome family. ' +
      'Conflict (409) if already COMPLETED.',
  })
  @ApiOkResponse({ type: TodayRoutineDto })
  @ApiConflictResponse({ description: 'Step already COMPLETED today' })
  skipStep(
    @Req() req: Request,
    @Param('routineId', ParseUUIDPipe) routineId: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body() body: SkipStepDto,
  ): Promise<TodayRoutineDto> {
    return this.routineTrackingService.skipStep(
      this.requireUserId(req),
      routineId,
      stepId,
      body,
    );
  }

  @Post(':routineId/check-ins')
  @Roles(Role.Customer)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit a daily skin check-in',
    description:
      'One check-in per routine per date+period. Duplicate → 409. ' +
      'Date defaults to today (Asia/Ho_Chi_Minh); same-day only for MVP. ' +
      'completionRate is computed from step completions for that day/period and stored. ' +
      'Allowed with partial progress (e.g. 3/4).',
  })
  @ApiCreatedResponse({ type: CheckInResponseDto })
  @ApiConflictResponse({
    description: 'Check-in already exists for date+period',
  })
  createCheckIn(
    @Req() req: Request,
    @Param('routineId', ParseUUIDPipe) routineId: string,
    @Body() body: CreateCheckInDto,
  ): Promise<CheckInResponseDto> {
    return this.routineTrackingService.createCheckIn(
      this.requireUserId(req),
      routineId,
      body,
    );
  }

  @Get(':routineId/check-ins')
  @Roles(Role.Customer)
  @ApiOperation({
    summary: 'List check-ins in a date range',
    description:
      'Owner only. from/to are YYYY-MM-DD (Asia/Ho_Chi_Minh calendar dates).',
  })
  @ApiOkResponse({ type: [CheckInResponseDto] })
  listCheckIns(
    @Req() req: Request,
    @Param('routineId', ParseUUIDPipe) routineId: string,
    @Query() query: DateRangeQueryDto,
  ): Promise<CheckInResponseDto[]> {
    return this.routineTrackingService.listCheckIns(
      this.requireUserId(req),
      routineId,
      query.from,
      query.to,
    );
  }

  @Get(':routineId/history')
  @Roles(Role.Customer)
  @ApiOperation({
    summary: 'Routine adherence history for calendar',
    description:
      'Returns days with status COMPLETED | PARTIAL | MISSED | NOT_STARTED plus completionRate. ' +
      'MISSED is derived on-read: past calendar days after routine activation with zero step actions. ' +
      'Timezone: Asia/Ho_Chi_Minh. Day COMPLETED when every period that has steps is fully acted (COMPLETED or SKIPPED). ' +
      'Summary includes currentStreak and averageCompletionRate.',
  })
  @ApiOkResponse({ type: RoutineHistoryResponseDto })
  getHistory(
    @Req() req: Request,
    @Param('routineId', ParseUUIDPipe) routineId: string,
    @Query() query: DateRangeQueryDto,
  ): Promise<RoutineHistoryResponseDto> {
    return this.routineTrackingService.getHistory(
      this.requireUserId(req),
      routineId,
      query.from,
      query.to,
    );
  }

  @Get(':routineId/history/:date')
  @Roles(Role.Customer)
  @ApiOperation({
    summary: 'History day detail (steps + check-in snapshot)',
    description:
      'Open a past/today date to see step outcomes and optional check-in. Period defaults by server VN time.',
  })
  @ApiOkResponse({ type: HistoryDayDetailResponseDto })
  getHistoryDay(
    @Req() req: Request,
    @Param('routineId', ParseUUIDPipe) routineId: string,
    @Param('date') date: string,
    @Query() query: HistoryDayQueryDto,
  ): Promise<HistoryDayDetailResponseDto> {
    return this.routineTrackingService.getHistoryDay(
      this.requireUserId(req),
      routineId,
      date,
      query.period,
    );
  }

  @Get(':id')
  @Roles(Role.Customer)
  @ApiOperation({
    summary: 'Get a routine by id',
    description:
      'Returns a single routine with enriched step detail for Today Routine / Step Detail. ' +
      'Only the owning customer may access it.',
  })
  @ApiOkResponse({ type: RoutineResponseDto })
  @ApiNotFoundResponse({ description: 'Routine not found' })
  @ApiForbiddenResponse({ description: 'Routine belongs to another customer' })
  getById(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RoutineResponseDto> {
    return this.routineGeneratorService.getMyRoutineById(
      this.requireUserId(req),
      id,
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
