import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SessionGuard } from '../auth/guards/session.guard';
import { BookingsService } from './bookings.service';
import { ListSlotsQueryDto } from './dto/list-slots-query.dto';
import { AvailableSlotsResponseDto } from './dto/slot-response.dto';

@ApiTags('Bookings')
@Controller('bookings')
@UseGuards(SessionGuard)
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

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
}
