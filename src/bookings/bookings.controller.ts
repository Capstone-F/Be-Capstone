import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
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
  BookingResponseDto,
  PaginatedBookingsDto,
} from './dto/booking-response.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto';
import { ListSlotsQueryDto } from './dto/list-slots-query.dto';
import { AvailableSlotsResponseDto } from './dto/slot-response.dto';

@ApiTags('Bookings')
@Controller('bookings')
@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @Roles(Role.Customer)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a consultation request',
    description:
      'Books a consultation slot with an expert. Validates that scheduledAt falls within ' +
      'the expert availability and is not already booked. Auto-creates a customer profile if needed.',
  })
  @ApiCreatedResponse({ type: BookingResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid scheduledAt or outside availability',
  })
  @ApiNotFoundResponse({ description: 'Expert not found' })
  @ApiConflictResponse({ description: 'Slot already booked' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  createBooking(@Req() req: Request, @Body() body: CreateBookingDto) {
    const userId = this.requireUserId(req);
    return this.bookingsService.createBooking(userId, body);
  }

  @Get('me')
  @ApiOperation({
    summary: 'List my bookings',
    description:
      'Returns consultation requests for the authenticated user. Customers see bookings they made; ' +
      'experts see bookings assigned to them. Use ?as=customer|expert to disambiguate when needed.',
  })
  @ApiOkResponse({ type: PaginatedBookingsDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  listMyBookings(@Req() req: Request, @Query() query: ListBookingsQueryDto) {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Not authenticated');
    }
    const roles = (auth.roles?.length ? auth.roles : [Role.Customer]) as Role[];
    return this.bookingsService.listMyBookings(auth.userId, roles, query);
  }

  @Get(':expertId')
  @ApiOperation({
    summary: 'List available booking slots for an expert',
    description:
      'Returns hourly-stepped consultation slots for the week or month containing the anchor date. ' +
      'Each slot spans the expert sessionLengthHours. Slots overlapping active bookings are marked unavailable.',
  })
  @ApiOkResponse({ type: AvailableSlotsResponseDto })
  @ApiNotFoundResponse({ description: 'Expert not found' })
  getAvailableSlots(
    @Param('expertId') expertId: string,
    @Query() query: ListSlotsQueryDto,
  ) {
    return this.bookingsService.getAvailableSlots(expertId, query);
  }

  private requireUserId(req: Request): string {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Not authenticated');
    }
    return auth.userId;
  }
}
