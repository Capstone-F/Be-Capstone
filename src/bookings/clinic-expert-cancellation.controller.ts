import {
  Controller,
  ForbiddenException,
  Get,
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
  ExpertCancellationStatsQueryDto,
  ExpertCancellationStatsResponseDto,
} from './dto/expert-cancellation-stats.dto';
import { ExpertCancellationStatsService } from './expert-cancellation-stats.service';

@ApiTags('Clinic Manager')
@Controller('clinic/experts')
@UseGuards(SessionGuard, RolesGuard)
@Roles(Role.ClinicManager)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class ClinicExpertCancellationController {
  constructor(private readonly statsService: ExpertCancellationStatsService) {}

  @Get('cancellation-stats')
  @ApiOperation({
    summary: 'Cancellation report for experts in own clinic',
    description:
      'Same aggregates as the admin report, scoped to the bound clinic: ' +
      'expert-initiated cancels, EXPERT_NO_SHOW auto-cancels, and cancel rate ' +
      'over a rolling window, flagged against the configured limit.',
  })
  @ApiOkResponse({ type: ExpertCancellationStatsResponseDto })
  @ApiForbiddenResponse({
    description: 'Clinic manager is not bound to a clinic',
  })
  getStats(
    @Req() req: Request,
    @Query() query: ExpertCancellationStatsQueryDto,
  ): Promise<ExpertCancellationStatsResponseDto> {
    return this.statsService.getStats({
      clinicId: this.requireClinicId(req),
      days: query.days,
    });
  }

  private requireClinicId(req: Request): string {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Chưa xác thực');
    }
    if (!auth.clinicId) {
      throw new ForbiddenException(
        'Người quản lý phòng khám chưa được gắn với phòng khám',
      );
    }
    return auth.clinicId;
  }
}
