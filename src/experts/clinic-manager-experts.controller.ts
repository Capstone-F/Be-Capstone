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
import { PaginatedExpertsDto } from './dto/expert-response.dto';
import { ListClinicExpertsQueryDto } from './dto/list-clinic-experts.dto';
import { ExpertsService } from './experts.service';

@ApiTags('Clinic Manager')
@Controller('clinic')
@UseGuards(SessionGuard, RolesGuard)
@Roles(Role.ClinicManager)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class ClinicManagerExpertsController {
  constructor(private readonly expertsService: ExpertsService) {}

  @Get('experts')
  @ApiOperation({
    summary: 'List experts in own clinic (includes deactivated)',
    description:
      'Clinic manager roster of experts scoped to their bound clinic. ' +
      'Unlike the public directory, inactive experts are included.',
  })
  @ApiOkResponse({ type: PaginatedExpertsDto })
  @ApiForbiddenResponse({
    description: 'Clinic manager is not bound to a clinic',
  })
  listExperts(
    @Req() req: Request,
    @Query() query: ListClinicExpertsQueryDto,
  ): Promise<PaginatedExpertsDto> {
    return this.expertsService.findByClinicForManager(
      this.requireClinicId(req),
      query,
    );
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
