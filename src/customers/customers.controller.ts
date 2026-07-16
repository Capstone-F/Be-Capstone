import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { getAuthContext } from '../auth/auth-context';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
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
