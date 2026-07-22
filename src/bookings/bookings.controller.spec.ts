import { UnauthorizedException } from '@nestjs/common';
import { Role } from '../auth/roles.enum';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

describe('BookingsController', () => {
  const bookingsService = {
    createBooking: jest.fn(),
    listMyBookings: jest.fn(),
    getAvailableSlots: jest.fn(),
    confirmBooking: jest.fn(),
    cancelBooking: jest.fn(),
    startBooking: jest.fn(),
    completeBooking: jest.fn(),
    submitFeedback: jest.fn(),
    getMyBooking: jest.fn(),
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

  it('confirmBooking should use Bearer authContext userId', async () => {
    bookingsService.confirmBooking.mockResolvedValue({
      id: 'c-1',
      status: 'CONFIRMED',
    } as any);
    const req = {
      authContext: { userId: 'u-expert', roles: [Role.Expert] },
      session: {},
    } as any;

    await controller.confirmBooking(req, 'c-1');

    expect(bookingsService.confirmBooking).toHaveBeenCalledWith(
      'u-expert',
      'c-1',
    );
  });

  it('cancelBooking should pass userId, roles, id, and body', async () => {
    bookingsService.cancelBooking.mockResolvedValue({
      id: 'c-1',
      status: 'CANCELLED',
    } as any);
    const req = {
      authContext: { userId: 'u-cust', roles: [Role.Customer] },
      session: {},
    } as any;

    await controller.cancelBooking(req, 'c-1', { reason: 'busy' });

    expect(bookingsService.cancelBooking).toHaveBeenCalledWith(
      'u-cust',
      [Role.Customer],
      'c-1',
      { reason: 'busy' },
    );
  });

  it('startBooking and completeBooking should pass userId and id', async () => {
    bookingsService.startBooking.mockResolvedValue({
      id: 'c-1',
      status: 'IN_PROGRESS',
    } as any);
    bookingsService.completeBooking.mockResolvedValue({
      id: 'c-1',
      status: 'COMPLETED',
    } as any);
    const req = {
      authContext: { userId: 'u-expert', roles: [Role.Expert] },
      session: {},
    } as any;

    await controller.startBooking(req, 'c-1');
    await controller.completeBooking(req, 'c-1');

    expect(bookingsService.startBooking).toHaveBeenCalledWith(
      'u-expert',
      'c-1',
    );
    expect(bookingsService.completeBooking).toHaveBeenCalledWith(
      'u-expert',
      'c-1',
    );
  });

  it('submitFeedback should pass userId, id, and body', async () => {
    bookingsService.submitFeedback.mockResolvedValue({
      id: 'c-1',
      feedback: { rating: 5, comment: null },
    } as any);
    const req = {
      authContext: { userId: 'u-cust', roles: [Role.Customer] },
      session: {},
    } as any;

    await controller.submitFeedback(req, 'c-1', { rating: 5 });

    expect(bookingsService.submitFeedback).toHaveBeenCalledWith(
      'u-cust',
      'c-1',
      {
        rating: 5,
      },
    );
  });

  it('getMyBooking should pass userId, roles, and id', async () => {
    bookingsService.getMyBooking.mockResolvedValue({ id: 'c-1' } as any);
    const req = {
      authContext: { userId: 'u-cust', roles: [Role.Customer] },
      session: {},
    } as any;

    await controller.getMyBooking(req, 'c-1');

    expect(bookingsService.getMyBooking).toHaveBeenCalledWith(
      'u-cust',
      [Role.Customer],
      'c-1',
    );
  });
});
