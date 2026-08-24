import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiForbiddenResponse,
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
import {
  AdminExpertCancellationStatsQueryDto,
  ExpertCancellationPolicyDto,
  ExpertCancellationStatsResponseDto,
  UpdateExpertCancellationPolicyDto,
} from './dto/expert-cancellation-stats.dto';
import { ExpertCancellationStatsService } from './expert-cancellation-stats.service';

@ApiTags('Admin Experts')
@Controller('admin/experts')
@UseGuards(SessionGuard, RolesGuard)
@Roles(Role.AppAdmin)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
export class AdminExpertCancellationController {
  constructor(private readonly statsService: ExpertCancellationStatsService) {}

  @Get('cancellation-stats')
  @ApiOperation({
    summary: 'Per-expert cancellation report (abuse detection)',
    description:
      'Aggregates bookings per expert over a rolling window: assigned count, ' +
      'expert-initiated cancels, EXPERT_NO_SHOW auto-cancels, and the cancel ' +
      'rate. Experts at or over the configured limit are flagged; acting on a ' +
      'flag (deactivating the expert) stays a human decision.',
  })
  @ApiOkResponse({ type: ExpertCancellationStatsResponseDto })
  getStats(
    @Query() query: AdminExpertCancellationStatsQueryDto,
  ): Promise<ExpertCancellationStatsResponseDto> {
    return this.statsService.getStats({
      days: query.days,
      clinicId: query.clinicId,
    });
  }

  @Get('cancellation-policy')
  @ApiOperation({
    summary: 'Get the expert cancellation flagging policy',
    description:
      'Cancel limit and rolling window used by the cancellation report. ' +
      'Falls back to the deployment defaults until an admin overrides them.',
  })
  @ApiOkResponse({ type: ExpertCancellationPolicyDto })
  getPolicy(): Promise<ExpertCancellationPolicyDto> {
    return this.statsService.getPolicyWithWarnings();
  }

  @Patch('cancellation-policy')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update the expert cancellation flagging policy (app_admin only)',
    description: 'Overrides take effect immediately for subsequent reports.',
  })
  @ApiOkResponse({ type: ExpertCancellationPolicyDto })
  updatePolicy(
    @Req() req: Request,
    @Body() dto: UpdateExpertCancellationPolicyDto,
  ): Promise<ExpertCancellationPolicyDto> {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Chưa xác thực');
    }
    return this.statsService.updatePolicy(auth.userId, dto);
  }
}
