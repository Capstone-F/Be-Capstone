import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { Role } from '../auth/roles.enum';
import { Roles } from '../auth/decorators/roles.decorator';
import { CustomersService } from './customers.service';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';

@ApiTags('Admin Customers')
@Controller('admin/customers')
@UseGuards(SessionGuard, RolesGuard)
@Roles(Role.AppAdmin)
@ApiBearerAuth()
export class AdminCustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Patch(':id/profile')
  @ApiOperation({
    summary: 'Cheat: Update customer profile and invalidate recommendations',
  })
  async updateProfile(
    @Param('id') customerId: string,
    @Body() dto: UpdateCustomerProfileDto,
  ) {
    return this.customersService.adminUpdateProfile(customerId, dto);
  }

  @Patch(':id/surveys/:surveyId')
  @ApiOperation({
    summary: 'Cheat: Update customer survey and invalidate recommendations',
  })
  async updateSurvey(
    @Param('id') customerId: string,
    @Param('surveyId') surveyId: string,
    @Body() dto: any,
  ) {
    return this.customersService.adminUpdateSurvey(customerId, surveyId, dto);
  }
}
