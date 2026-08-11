import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCookieAuth,
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
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { Role } from '../auth/roles.enum';
import { CustomersService } from './customers.service';
import {
  AllergyLabelDto,
  CustomerProfileResponseDto,
} from './dto/customer-profile-response.dto';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';
import { UpdateCustomerSkinTypeDto } from './dto/update-customer-skin-type.dto';

@ApiTags('Customers')
@Controller('customers')
@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get('allergies')
  @Public()
  @ApiOperation({
    summary: 'Get available allergy options',
    description:
      'Public. Returns active ALLERGY labels that can be submitted as allergyLabelCodes to PATCH /customers/me.',
  })
  @ApiOkResponse({ type: [AllergyLabelDto] })
  async getAllergies(): Promise<AllergyLabelDto[]> {
    return this.customersService.getAllergyOptions();
  }

  @Get('me')
  @ApiOperation({
    summary: 'Get own customer profile',
    description:
      'Returns customer-specific profile data including allergies and read-only survey history.',
  })
  @ApiOkResponse({ type: CustomerProfileResponseDto })
  async getMe(@Req() req: Request): Promise<CustomerProfileResponseDto> {
    const userId = this.requireUserId(req);
    return this.customersService.getOwnCustomerProfile(userId);
  }

  @Get(':id/consultation-context')
  @Roles(Role.Expert)
  @ApiOperation({
    summary:
      'Get customer profile, survey history, and treatment history for consultation prep',
    description:
      'Requires a booking in CONFIRMED, IN_PROGRESS, COMPLETED, or CANCELLED where consultationId is assigned to the current expert and matches this customer. Returns treatment summaries only; use GET /treatments/:id/chart for full chart (read-only).',
  })
  @ApiQuery({
    name: 'consultationId',
    required: true,
    description: 'ConsultationRequest / booking id',
    type: String,
  })
  @ApiOkResponse({ type: CustomerProfileResponseDto })
  @ApiForbiddenResponse({
    description: 'No accepted booking for this expert and customer',
  })
  @ApiNotFoundResponse({ description: 'Customer or consultation not found' })
  getConsultationContext(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('consultationId', ParseUUIDPipe) consultationId: string,
  ): Promise<CustomerProfileResponseDto> {
    return this.customersService.getConsultationContext(
      this.requireUserId(req),
      id,
      consultationId,
    );
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update own customer profile',
    description:
      'Updates customer profile fields and replaces the allergy set. Survey history is read-only.',
  })
  @ApiOkResponse({ type: CustomerProfileResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid profile data' })
  async updateMe(
    @Req() req: Request,
    @Body() body: UpdateCustomerProfileDto,
  ): Promise<CustomerProfileResponseDto> {
    const userId = this.requireUserId(req);
    return this.customersService.updateOwnCustomerProfile(userId, body);
  }

  @Patch('me/skin-type')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update own Baumann skin type',
    description:
      'Sets the customer profile Baumann skin type by 16-type code (e.g. OSPT) and optional axis scores. Omitted scores are cleared; assessedAt is refreshed.',
  })
  @ApiOkResponse({ type: CustomerProfileResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid skin type code or axis scores',
  })
  async updateMySkinType(
    @Req() req: Request,
    @Body() body: UpdateCustomerSkinTypeDto,
  ): Promise<CustomerProfileResponseDto> {
    const userId = this.requireUserId(req);
    return this.customersService.updateOwnSkinType(userId, body);
  }

  private requireUserId(req: Request): string {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Not authenticated');
    }
    return auth.userId;
  }
}
