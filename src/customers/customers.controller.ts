import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { getAuthContext } from '../auth/auth-context';
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

@ApiTags('Customers')
@Controller('customers')
@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get('allergies')
  @ApiOperation({
    summary: 'Get available allergy options',
    description:
      'Returns active ALLERGY labels that can be submitted as allergyLabelCodes to PATCH /customers/me.',
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
    summary: 'Get customer profile + survey history for consultation prep',
    description:
      'Assigned expert only (must share a booking or treatment with the customer).',
  })
  @ApiOkResponse({ type: CustomerProfileResponseDto })
  @ApiForbiddenResponse({ description: 'No relationship with customer' })
  @ApiNotFoundResponse({ description: 'Customer not found' })
  getConsultationContext(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustomerProfileResponseDto> {
    return this.customersService.getConsultationContext(
      this.requireUserId(req),
      id,
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

  private requireUserId(req: Request): string {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Not authenticated');
    }
    return auth.userId;
  }
}
