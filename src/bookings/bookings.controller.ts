import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { CreateBookingFeedbackDto } from './dto/create-booking-feedback.dto';
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

  @Get('me/:id')
  @ApiOperation({
    summary: 'Get one of my bookings',
    description:
      'Owning customer or assigned expert. Includes feedback when present.',
  })
  @ApiOkResponse({ type: BookingResponseDto })
  @ApiForbiddenResponse({ description: 'Not allowed to view this booking' })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  getMyBooking(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Not authenticated');
    }
    const roles = (auth.roles?.length ? auth.roles : [Role.Customer]) as Role[];
    return this.bookingsService.getMyBooking(auth.userId, roles, id);
  }

  @Post(':id/feedback')
  @Roles(Role.Customer)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit feedback for a completed booking',
    description:
      'Owning customer only, when status is COMPLETED. One feedback per consultation. ' +
      'Updates the expert aggregate rating from all feedback averages.',
  })
  @ApiCreatedResponse({ type: BookingResponseDto })
  @ApiBadRequestResponse({
    description: 'Booking is not COMPLETED or invalid rating',
  })
  @ApiConflictResponse({ description: 'Feedback already submitted' })
  @ApiForbiddenResponse({ description: 'Not the owning customer' })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  submitFeedback(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateBookingFeedbackDto,
  ) {
    const userId = this.requireUserId(req);
    return this.bookingsService.submitFeedback(userId, id, body);
  }

  @Patch(':id/confirm')
  @Roles(Role.Expert)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm a pending booking',
    description:
      'Assigned expert only. Transitions status from PENDING to CONFIRMED. ' +
      'Customers see the updated status on GET /bookings/me.',
  })
  @ApiOkResponse({ type: BookingResponseDto })
  @ApiBadRequestResponse({
    description: 'Booking is not in PENDING status',
  })
  @ApiForbiddenResponse({
    description: 'Not the assigned expert or missing expert profile',
  })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  confirmBooking(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const userId = this.requireUserId(req);
    return this.bookingsService.confirmBooking(userId, id);
  }

  @Patch(':id/cancel')
  @Roles(Role.Customer, Role.Expert)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a booking',
    description:
      'Owning customer or assigned expert. Allowed from PENDING or CONFIRMED only ' +
      '(IN_PROGRESS cannot be cancelled). Sets status CANCELLED and stores cancelledAt, ' +
      'cancelReason, cancelledBy. Freed slot becomes bookable again.',
  })
  @ApiOkResponse({ type: BookingResponseDto })
  @ApiBadRequestResponse({
    description: 'Booking is not PENDING or CONFIRMED',
  })
  @ApiForbiddenResponse({
    description: 'Not the owning customer or assigned expert',
  })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  cancelBooking(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CancelBookingDto,
  ) {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Not authenticated');
    }
    const roles = (auth.roles?.length ? auth.roles : []) as Role[];
    return this.bookingsService.cancelBooking(auth.userId, roles, id, body);
  }

  @Patch(':id/start')
  @Roles(Role.Expert)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start a confirmed consultation',
    description:
      'Assigned expert only. Transitions CONFIRMED → IN_PROGRESS and sets startedAt. ' +
      'Start is required before complete.',
  })
  @ApiOkResponse({ type: BookingResponseDto })
  @ApiBadRequestResponse({
    description: 'Booking is not in CONFIRMED status',
  })
  @ApiForbiddenResponse({
    description: 'Not the assigned expert or missing expert profile',
  })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  startBooking(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const userId = this.requireUserId(req);
    return this.bookingsService.startBooking(userId, id);
  }

  @Patch(':id/complete')
  @Roles(Role.Expert)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete an in-progress consultation',
    description:
      'Assigned expert only. Transitions IN_PROGRESS → COMPLETED and sets completedAt. ' +
      'Must call start first; completing from CONFIRMED is not allowed.',
  })
  @ApiOkResponse({ type: BookingResponseDto })
  @ApiBadRequestResponse({
    description: 'Booking is not in IN_PROGRESS status',
  })
  @ApiForbiddenResponse({
    description: 'Not the assigned expert or missing expert profile',
  })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  completeBooking(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const userId = this.requireUserId(req);
    return this.bookingsService.completeBooking(userId, id);
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
