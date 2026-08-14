import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { Role } from '../auth/roles.enum';
import { BookingExpiryProcessor } from './booking-expiry.processor';
import {
  TickBookingExpiryDto,
  TickBookingExpiryResponseDto,
} from './dto/tick-booking-expiry.dto';

@ApiTags('Bookings')
@Controller('admin/bookings')
@UseGuards(SessionGuard, RolesGuard)
@Roles(Role.Staff, Role.AppAdmin)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
export class AdminBookingsController {
  constructor(private readonly expiryProcessor: BookingExpiryProcessor) {}

  @Post('expiry/tick')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run one booking-expiry sweep now',
    description:
      'Does exactly what the cron sweep would do: auto-cancels + refunds PENDING bookings past ' +
      'the confirm window and CONFIRMED bookings the expert never started. Pass bookingId with ' +
      'ignoreDeadline=true to force one booking without waiting out the window (demo).',
  })
  @ApiOkResponse({ type: TickBookingExpiryResponseDto })
  tick(
    @Body() dto: TickBookingExpiryDto,
  ): Promise<TickBookingExpiryResponseDto> {
    return this.expiryProcessor.tick({
      bookingId: dto.bookingId,
      ignoreDeadline: dto.ignoreDeadline ?? false,
    });
  }
}
