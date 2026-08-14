import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { Role } from '../auth/roles.enum';
import { DemoSeedService } from './demo-seed.service';
import { SeedDemoCustomerResponseDto } from './dto/demo-customer-response.dto';
import { SeedDemoCustomerDto } from './dto/seed-demo-customer.dto';

@ApiTags('Admin Demo')
@Controller('admin/demo')
@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class AdminDemoController {
  constructor(private readonly demoSeedService: DemoSeedService) {}

  @Post('customers')
  @Roles(Role.AppAdmin)
  @ApiOperation({
    summary: 'Seed a ready-to-demo customer account (app_admin only)',
    description:
      'Creates a Keycloak customer login plus a paid SURVEY order, an ACTIVE AI routine backdated ' +
      'by historyDays, completed step history, daily check-ins, and one product already sitting on ' +
      'a LOW stock warning in GET /routines/me/today. Today is deliberately left untouched so a live ' +
      'check-in can still be demoed. The response echoes the plain-text password — app_admin only, ' +
      'intended for demo and QA environments.',
  })
  @ApiCreatedResponse({ type: SeedDemoCustomerResponseDto })
  @ApiBadRequestResponse({
    description: 'Catalog has no ml-based product variants to build a routine',
  })
  @ApiConflictResponse({ description: 'Email already in use' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  seedCustomer(
    @Body() body: SeedDemoCustomerDto,
  ): Promise<SeedDemoCustomerResponseDto> {
    return this.demoSeedService.seedDemoCustomer(body);
  }
}
