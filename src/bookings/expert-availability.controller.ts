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
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
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
import { CallerContext } from '../users/users.service';
import { CreateExpertAvailabilityDto } from './dto/create-expert-availability.dto';
import {
  ExpertAvailabilityListDto,
  ExpertAvailabilityResponseDto,
} from './dto/expert-availability-response.dto';
import { UpdateExpertAvailabilityDto } from './dto/update-expert-availability.dto';
import { ExpertAvailabilityService } from './expert-availability.service';

@ApiTags('Expert Availability')
@Controller('experts/:expertId/availability')
@UseGuards(SessionGuard, RolesGuard)
@Roles(Role.Expert, Role.ClinicManager, Role.AppAdmin)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
export class ExpertAvailabilityController {
  constructor(
    private readonly availabilityService: ExpertAvailabilityService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List expert availability blocks',
    description:
      'Returns weekly recurring availability windows for the expert. ' +
      'Accessible by the expert themselves, their clinic manager, or an app admin.',
  })
  @ApiOkResponse({ type: ExpertAvailabilityListDto })
  @ApiNotFoundResponse({ description: 'Expert not found' })
  list(
    @Req() req: Request,
    @Param('expertId', ParseUUIDPipe) expertId: string,
  ) {
    return this.availabilityService.list(
      this.buildCallerContext(req),
      expertId,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create an availability block',
    description:
      'Adds a weekly recurring window (dayOfWeek + startHour–endHour UTC). ' +
      'Rejects overlapping blocks on the same day.',
  })
  @ApiCreatedResponse({ type: ExpertAvailabilityResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid hour window' })
  @ApiConflictResponse({ description: 'Overlaps existing block' })
  @ApiNotFoundResponse({ description: 'Expert not found' })
  create(
    @Req() req: Request,
    @Param('expertId', ParseUUIDPipe) expertId: string,
    @Body() body: CreateExpertAvailabilityDto,
  ) {
    return this.availabilityService.create(
      this.buildCallerContext(req),
      expertId,
      body,
    );
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update an availability block',
    description:
      'Updates dayOfWeek and/or hours for an existing block. ' +
      'Rejects overlapping blocks on the same day.',
  })
  @ApiOkResponse({ type: ExpertAvailabilityResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid hour window' })
  @ApiConflictResponse({ description: 'Overlaps existing block' })
  @ApiNotFoundResponse({ description: 'Expert or availability not found' })
  update(
    @Req() req: Request,
    @Param('expertId', ParseUUIDPipe) expertId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateExpertAvailabilityDto,
  ) {
    return this.availabilityService.update(
      this.buildCallerContext(req),
      expertId,
      id,
      body,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an availability block',
    description: 'Removes a weekly recurring availability window.',
  })
  @ApiNoContentResponse({ description: 'Availability block deleted' })
  @ApiNotFoundResponse({ description: 'Expert or availability not found' })
  async remove(
    @Req() req: Request,
    @Param('expertId', ParseUUIDPipe) expertId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.availabilityService.remove(
      this.buildCallerContext(req),
      expertId,
      id,
    );
  }

  private buildCallerContext(req: Request): CallerContext {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Not authenticated');
    }
    return {
      userId: auth.userId,
      roles: (auth.roles?.length ? auth.roles : [Role.Customer]) as Role[],
      clinicId: auth.clinicId ?? null,
    };
  }
}
