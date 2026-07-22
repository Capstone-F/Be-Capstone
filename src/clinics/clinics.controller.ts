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
import { ClinicsService } from './clinics.service';
import {
  ClinicResponseDto,
  PaginatedClinicsDto,
} from './dto/clinic-response.dto';
import { ListClinicsQueryDto } from './dto/list-clinics-query.dto';

@ApiTags('Clinics')
@Controller('clinics')
@UseGuards(SessionGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class ClinicsController {
  constructor(private readonly clinicsService: ClinicsService) {}

  @Get()
  @ApiOperation({
    summary: 'List active clinics',
    description:
      'Returns active partner clinics for expert discovery and booking.',
  })
  @ApiOkResponse({ type: PaginatedClinicsDto })
  list(@Query() query: ListClinicsQueryDto) {
    return this.clinicsService.findMany(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get clinic by id',
    description: 'Basic clinic profile for Expert Detail and booking confirm.',
  })
  @ApiOkResponse({ type: ClinicResponseDto })
  @ApiNotFoundResponse({ description: 'Clinic not found' })
  getById(@Param('id') id: string) {
    return this.clinicsService.findOne(id);
  }
}
