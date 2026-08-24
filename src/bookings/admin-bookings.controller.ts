import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UnauthorizedException,
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
import type { Request } from 'express';
import { getAuthContext } from '../auth/auth-context';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { Role } from '../auth/roles.enum';
import { BookingExpiryProcessor } from './booking-expiry.processor';
import { BookingSettingsService } from './booking-settings.service';
import {
  BookingSettingsDto,
  UpdateBookingSettingsDto,
} from './dto/booking-settings.dto';
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
  constructor(
    private readonly expiryProcessor: BookingExpiryProcessor,
    private readonly bookingSettingsService: BookingSettingsService,
  ) {}

  @Get('settings')
  @ApiOperation({
    summary: 'Get the booking deadline settings',
    description:
      'Expert confirm timeout, expert no-show grace, and the minimum lead time ' +
      'a booking must be created before its slot. Values fall back to the ' +
      'deployment defaults until an admin overrides them.',
  })
  @ApiOkResponse({ type: BookingSettingsDto })
  getSettings(): Promise<BookingSettingsDto> {
    return this.bookingSettingsService.getSettingsWithWarnings();
  }

  @Patch('settings')
  @Roles(Role.AppAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update the booking deadline settings (app_admin only)',
    description:
      'Overrides take effect immediately for new bookings and the next expiry sweep.',
  })
  @ApiOkResponse({ type: BookingSettingsDto })
  updateSettings(
    @Req() req: Request,
    @Body() dto: UpdateBookingSettingsDto,
  ): Promise<BookingSettingsDto> {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Chưa xác thực');
    }
    return this.bookingSettingsService.updateSettings(auth.userId, dto);
  }

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
