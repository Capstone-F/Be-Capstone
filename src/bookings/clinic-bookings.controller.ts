import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
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
import { BookingsService } from './bookings.service';
import {
  ClinicBookingResponseDto,
  PaginatedClinicBookingsDto,
} from './dto/clinic-booking-response.dto';
import { ListClinicBookingsQueryDto } from './dto/list-clinic-bookings-query.dto';

@ApiTags('Clinic Manager')
@Controller('clinic')
@UseGuards(SessionGuard, RolesGuard)
@Roles(Role.ClinicManager)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class ClinicBookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get('bookings')
  @ApiOperation({
    summary: 'List bookings for all experts in own clinic (read-only)',
    description:
      'Clinic manager oversight of consultation bookings, scoped to their clinic. ' +
      'Each row includes the escrow hold status.',
  })
  @ApiOkResponse({ type: PaginatedClinicBookingsDto })
  @ApiForbiddenResponse({
    description: 'Clinic manager is not bound to a clinic',
  })
  listBookings(
    @Req() req: Request,
    @Query() query: ListClinicBookingsQueryDto,
  ): Promise<PaginatedClinicBookingsDto> {
    return this.bookingsService.findByClinic(this.requireClinicId(req), query);
  }

  @Get('bookings/:id')
  @ApiOperation({
    summary: 'Get one booking in own clinic (read-only)',
  })
  @ApiOkResponse({ type: ClinicBookingResponseDto })
  @ApiForbiddenResponse({
    description: 'Booking does not belong to your clinic',
  })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  getBooking(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ClinicBookingResponseDto> {
    return this.bookingsService.getClinicBooking(this.requireClinicId(req), id);
  }

  private requireClinicId(req: Request): string {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Chưa xác thực');
    }
    if (!auth.clinicId) {
      throw new ForbiddenException(
        'Người quản lý phòng khám chưa được gắn với phòng khám',
      );
    }
    return auth.clinicId;
  }
}
