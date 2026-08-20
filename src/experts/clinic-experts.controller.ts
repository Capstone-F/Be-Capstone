import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SessionGuard } from '../auth/guards/session.guard';
import { ClinicsService } from '../clinics/clinics.service';
import { PaginatedExpertsDto } from './dto/expert-response.dto';
import { ListExpertsQueryDto } from './dto/list-experts.dto';
import { ExpertsService } from './experts.service';

@ApiTags('Clinics')
@Controller('clinics')
@UseGuards(SessionGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class ClinicExpertsController {
  constructor(
    private readonly clinicsService: ClinicsService,
    private readonly expertsService: ExpertsService,
  ) {}

  @Get(':id/experts')
  @ApiOperation({
    summary: 'List bookable experts for a clinic',
    description:
      'Authenticated users only. Same filters as GET /experts, scoped to this clinicId. Only active experts with a clinic are returned.',
  })
  @ApiOkResponse({ type: PaginatedExpertsDto })
  @ApiNotFoundResponse({ description: 'Clinic not found' })
  async listExperts(
    @Param('id') id: string,
    @Query() query: ListExpertsQueryDto,
  ) {
    await this.clinicsService.requireById(id);
    return this.expertsService.findMany({ ...query, clinicId: id });
  }
}
