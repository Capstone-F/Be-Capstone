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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { Role } from '../auth/roles.enum';
import { AdminClinicBalancesService } from '../finance/admin-clinic-balances.service';
import { PaginatedAdminClinicBalancesDto } from '../finance/dto/admin-clinic-balance-response.dto';
import { ListAdminClinicBalancesQueryDto } from '../finance/dto/list-finance-query.dto';
import { ClinicsService } from './clinics.service';
import {
  AdminClinicResponseDto,
  PaginatedAdminClinicsDto,
  UpdateClinicCommissionDto,
} from './dto/clinic-commission.dto';
import { CreateClinicDto } from './dto/create-clinic.dto';
import { ListAdminClinicsQueryDto } from './dto/list-admin-clinics-query.dto';
import { UpdateClinicDto } from './dto/update-clinic.dto';

@ApiTags('Admin Clinics')
@Controller('admin/clinics')
@UseGuards(SessionGuard, RolesGuard)
@Roles(Role.AppAdmin)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
export class AdminClinicsController {
  constructor(
    private readonly clinicsService: ClinicsService,
    private readonly balancesService: AdminClinicBalancesService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List clinics (app_admin)',
    description:
      'Includes inactive clinics by default. Filter with activeOnly=true or q=name.',
  })
  @ApiOkResponse({ type: PaginatedAdminClinicsDto })
  list(
    @Query() query: ListAdminClinicsQueryDto,
  ): Promise<PaginatedAdminClinicsDto> {
    return this.clinicsService.adminFindMany(query);
  }

  // Declared before ':id' so the literal path is not captured by the param route.
  @Get('balances')
  @ApiOperation({
    summary: 'Per-clinic money position (app_admin)',
    description:
      'Available balance, held escrow, withdrawals awaiting review, ' +
      'commission collected from each clinic, and last payout time.',
  })
  @ApiOkResponse({ type: PaginatedAdminClinicBalancesDto })
  listBalances(
    @Query() query: ListAdminClinicBalancesQueryDto,
  ): Promise<PaginatedAdminClinicBalancesDto> {
    return this.balancesService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get clinic by id (app_admin)' })
  @ApiOkResponse({ type: AdminClinicResponseDto })
  @ApiNotFoundResponse({ description: 'Clinic not found' })
  getOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminClinicResponseDto> {
    return this.clinicsService.adminFindOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a partner clinic (app_admin)' })
  @ApiCreatedResponse({ type: AdminClinicResponseDto })
  create(@Body() dto: CreateClinicDto): Promise<AdminClinicResponseDto> {
    return this.clinicsService.create(dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update a clinic (app_admin)',
    description: 'Partial update. Set isActive true to reactivate a clinic.',
  })
  @ApiOkResponse({ type: AdminClinicResponseDto })
  @ApiNotFoundResponse({ description: 'Clinic not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClinicDto,
  ): Promise<AdminClinicResponseDto> {
    return this.clinicsService.update(id, dto);
  }

  @Patch(':id/commission')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update commission percent for one clinic' })
  @ApiOkResponse({ type: AdminClinicResponseDto })
  @ApiNotFoundResponse({ description: 'Clinic not found' })
  updateCommission(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClinicCommissionDto,
  ): Promise<AdminClinicResponseDto> {
    return this.clinicsService.updateCommission(id, dto.percent);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Soft-deactivate a clinic (app_admin)',
    description:
      'Sets isActive=false. Hard delete is not supported while experts reference the clinic (ON DELETE RESTRICT).',
  })
  @ApiOkResponse({ type: AdminClinicResponseDto })
  @ApiNotFoundResponse({ description: 'Clinic not found' })
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminClinicResponseDto> {
    return this.clinicsService.deactivate(id);
  }
}
