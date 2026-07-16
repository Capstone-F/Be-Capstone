import { UnauthorizedException } from '@nestjs/common';
import { Role } from '../auth/roles.enum';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

describe('BookingsController', () => {
  const bookingsService = {
    createBooking: jest.fn(),
    listMyBookings: jest.fn(),
    getAvailableSlots: jest.fn(),
  } as unknown as jest.Mocked<BookingsService>;

  const controller = new BookingsController(bookingsService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('listMyBookings should use Bearer authContext userId and roles', async () => {
    bookingsService.listMyBookings.mockResolvedValue({ data: [] } as any);
    const req = {
      authContext: {
        userId: 'u-bearer',
        roles: [Role.Customer, Role.Expert],
      },
      session: {},
    } as any;

    await controller.listMyBookings(req, {} as any);

    expect(bookingsService.listMyBookings).toHaveBeenCalledWith(
      'u-bearer',
      [Role.Customer, Role.Expert],
      {},
    );
  });

  it('createBooking should use Bearer authContext userId', async () => {
    bookingsService.createBooking.mockResolvedValue({ id: 'b1' } as any);
    const req = {
      authContext: { userId: 'u-bearer', roles: [Role.Customer] },
      session: {},
    } as any;
    const body = { expertId: 'e1', scheduledAt: '2026-01-01T10:00:00Z' };

    await controller.createBooking(req, body as any);

    expect(bookingsService.createBooking).toHaveBeenCalledWith(
      'u-bearer',
      body,
    );
  });

  it('createBooking should reject when not authenticated', () => {
    const req = { session: {} } as any;
    expect(() => controller.createBooking(req, {} as any)).toThrow(
      UnauthorizedException,
    );
  });
});
