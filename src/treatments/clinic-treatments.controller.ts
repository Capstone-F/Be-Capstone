import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
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
import {
  ClinicTreatmentResponseDto,
  PaginatedClinicTreatmentsDto,
} from './dto/clinic-treatment-response.dto';
import { ListClinicTreatmentsQueryDto } from './dto/list-clinic-treatments-query.dto';
import { TreatmentsService } from './treatments.service';

@ApiTags('Clinic Manager')
@Controller('clinic')
@UseGuards(SessionGuard, RolesGuard)
@Roles(Role.ClinicManager)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class ClinicTreatmentsController {
  constructor(private readonly treatmentsService: TreatmentsService) {}

  @Get('treatments')
  @ApiOperation({
    summary: 'List treatment plans in own clinic (read-only)',
    description:
      'Clinic manager oversight of submitted treatment plans, scoped to their clinic. ' +
      'Each row includes phases and an escrow summary (held/released/refunded).',
  })
  @ApiOkResponse({ type: PaginatedClinicTreatmentsDto })
  @ApiForbiddenResponse({
    description: 'Clinic manager is not bound to a clinic',
  })
  listTreatments(
    @Req() req: Request,
    @Query() query: ListClinicTreatmentsQueryDto,
  ): Promise<PaginatedClinicTreatmentsDto> {
    return this.treatmentsService.listByClinic(
      this.requireClinicId(req),
      query,
    );
  }

  @Get('treatments/:id')
  @ApiOperation({
    summary: 'Get one treatment plan in own clinic (read-only)',
  })
  @ApiOkResponse({ type: ClinicTreatmentResponseDto })
  @ApiForbiddenResponse({
    description: 'Treatment does not belong to your clinic',
  })
  @ApiNotFoundResponse({ description: 'Treatment not found' })
  getTreatment(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ClinicTreatmentResponseDto> {
    return this.treatmentsService.getByClinic(this.requireClinicId(req), id);
  }

  private requireClinicId(req: Request): string {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Not authenticated');
    }
    if (!auth.clinicId) {
      throw new ForbiddenException('Clinic manager is not bound to a clinic');
    }
    return auth.clinicId;
  }
}
