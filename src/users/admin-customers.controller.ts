import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { Role } from '../auth/roles.enum';
import { SurveyResponseDto } from '../survey/dto/survey-response.dto';
import { SurveyService } from '../survey/survey.service';
import { AdminUpdateCustomerProfileDto } from './dto/admin-update-customer-profile.dto';
import { AdminUpdateCustomerSurveyDto } from './dto/admin-update-customer-survey.dto';
import { UsersService } from './users.service';

@ApiTags('Admin Customers')
@Controller('admin/customers')
@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class AdminCustomersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly surveyService: SurveyService,
  ) {}

  @Patch(':id/survey')
  @Roles(Role.AppAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cheat update survey answers for a customer (app_admin only)',
  })
  @ApiOkResponse({ type: SurveyResponseDto })
  async updateSurvey(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdminUpdateCustomerSurveyDto,
  ): Promise<SurveyResponseDto> {
    return this.surveyService.adminUpdateSurveyByCustomerId(id, body.answers);
  }

  @Patch(':id/profile')
  @Roles(Role.AppAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cheat update customer profile and allergies (app_admin only)',
  })
  async updateProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdminUpdateCustomerProfileDto,
  ) {
    return this.usersService.adminUpdateCustomerProfile(id, body);
  }
}
