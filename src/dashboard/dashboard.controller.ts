import {
  Controller,
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
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import {
  AdminDashboardResponseDto,
  ExpertDashboardResponseDto,
  StaffDashboardResponseDto,
} from './dto/dashboard-response.dto';

@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
@ApiForbiddenResponse({ description: 'Insufficient role' })
@ApiTags('Dashboards')
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @Roles(Role.AppAdmin)
  @ApiOperation({ summary: 'Get the application-wide admin dashboard' })
  @ApiOkResponse({ type: AdminDashboardResponseDto })
  getDashboard(
    @Query() query: DashboardQueryDto,
  ): Promise<AdminDashboardResponseDto> {
    return this.dashboardService.getAdminDashboard(query.range);
  }
}

@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
@ApiForbiddenResponse({ description: 'Insufficient role' })
@ApiTags('Dashboards')
@Controller('experts/me/dashboard')
export class ExpertDashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @Roles(Role.Expert)
  @ApiOperation({ summary: 'Get the authenticated expert dashboard' })
  @ApiOkResponse({ type: ExpertDashboardResponseDto })
  getDashboard(
    @Req() req: Request,
    @Query() query: DashboardQueryDto,
  ): Promise<ExpertDashboardResponseDto> {
    return this.dashboardService.getExpertDashboard(
      this.requireUserId(req),
      query.range,
    );
  }

  private requireUserId(req: Request): string {
    const auth = getAuthContext(req);
    if (!auth?.userId) throw new UnauthorizedException('Not authenticated');
    return auth.userId;
  }
}

@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
@ApiForbiddenResponse({ description: 'Insufficient role' })
@ApiTags('Dashboards')
@Controller('staff/dashboard')
export class StaffDashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @Roles(Role.Staff, Role.AppAdmin)
  @ApiOperation({ summary: 'Get the staff operations dashboard' })
  @ApiOkResponse({ type: StaffDashboardResponseDto })
  getDashboard(
    @Req() req: Request,
    @Query() query: DashboardQueryDto,
  ): Promise<StaffDashboardResponseDto> {
    return this.dashboardService.getStaffDashboard(
      this.requireUserId(req),
      query.range,
    );
  }

  private requireUserId(req: Request): string {
    const auth = getAuthContext(req);
    if (!auth?.userId) throw new UnauthorizedException('Not authenticated');
    return auth.userId;
  }
}
