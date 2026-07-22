import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { Role } from '../auth/roles.enum';
import { ConsultationRequest } from '../consultations/consultation-request.entity';
import { ConsultationStatus } from '../consultations/enums';
import { Customer } from '../users/customer.entity';
import { Expert } from '../users/expert.entity';
import { BookingsService } from './bookings.service';
import { BookingPerspective, BookingRange, BookingTab } from './enums';
import { ExpertAvailability } from './expert-availability.entity';

const FUTURE_SLOT = '2030-01-09T09:00:00.000Z'; // Wednesday

const makeExpert = (overrides: Partial<Expert> = {}): Expert => ({
  id: 'expert-1',
  userId: 'user-1',
  clinicId: 'clinic-1',
  specialization: 'DERMATOLOGY' as Expert['specialization'],
  licenseNumber: 'LIC-001',
  bio: 'bio',
  rating: 4.5,
  consultationFee: 300000,
  sessionLengthHours: 2,
  isActive: true,
  user: { name: 'Dr. Expert' } as Expert['user'],
  clinic: {
    id: 'clinic-1',
    name: 'GlowScan Clinic',
    address: '12 Nguyen Hue',
  } as Expert['clinic'],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeCustomer = (overrides: Partial<Customer> = {}): Customer => ({
  id: 'cust-1',
  userId: 'user-customer-1',
  phone: null,
  avatarUrl: null,
  dateOfBirth: null,
  gender: 'NOT_PREFER_TO_SAY' as Customer['gender'],
  user: { name: 'Jane Customer' } as Customer['user'],
  skinTypeDetails: undefined as never,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeConsultation = (
  overrides: Partial<ConsultationRequest> = {},
): ConsultationRequest => ({
  id: 'c-1',
  customerId: 'cust-1',
  expertId: 'expert-1',
  reason: 'test reason',
  status: ConsultationStatus.PENDING,
  scheduledAt: new Date(FUTURE_SLOT),
  startedAt: null,
  completedAt: null,
  customer: makeCustomer(),
  expert: makeExpert(),
  chatHistory: [],
  feedback: undefined as never,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('BookingsService', () => {
  afterEach(() => jest.clearAllMocks());

  function makeService(options: {
    expert?: Expert | null;
    availability?: ExpertAvailability[];
    consultations?: ConsultationRequest[];
    customer?: Customer | null;
    findAndCountResult?: [ConsultationRequest[], number];
  }) {
    const expertRepo = {
      findOne: jest.fn().mockResolvedValue(options.expert ?? null),
    } as unknown as Repository<Expert>;

    const availabilityRepo = {
      find: jest.fn().mockResolvedValue(options.availability ?? []),
    } as unknown as Repository<ExpertAvailability>;

    const consultationRepo = {
      find: jest.fn().mockResolvedValue(options.consultations ?? []),
      findAndCount: jest
        .fn()
        .mockResolvedValue(options.findAndCountResult ?? [[], 0]),
      create: jest.fn((data) => ({ id: 'new-c-1', ...data })),
      save: jest.fn((data) =>
        Promise.resolve({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
    } as unknown as Repository<ConsultationRequest>;

    const customerRepo = {
      findOne: jest.fn().mockResolvedValue(options.customer ?? null),
      create: jest.fn((data) => ({ id: 'new-cust-1', ...data })),
      save: jest.fn((data) => Promise.resolve(data)),
      findOneOrFail: jest
        .fn()
        .mockResolvedValue(
          options.customer ??
            makeCustomer({ id: 'new-cust-1', userId: 'user-customer-1' }),
        ),
    } as unknown as Repository<Customer>;

    const service = new BookingsService(
      expertRepo,
      availabilityRepo,
      consultationRepo,
      customerRepo,
    );

    return {
      service,
      expertRepo,
      availabilityRepo,
      consultationRepo,
      customerRepo,
    };
  }

  const wednesdayAvailability: ExpertAvailability[] = [
    {
      id: 'av-1',
      expertId: 'expert-1',
      dayOfWeek: 3, // Wednesday 2030-01-08
      startHour: 9,
      endHour: 18,
      expert: undefined as never,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  describe('getAvailableSlots', () => {
    it('should throw NotFoundException when expert is missing or inactive', async () => {
      const { service } = makeService({ expert: null });

      await expect(
        service.getAvailableSlots('missing', { date: '2026-07-07' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return empty slots when expert has no availability', async () => {
      const { service } = makeService({
        expert: makeExpert(),
        availability: [],
      });

      const result = await service.getAvailableSlots('expert-1', {
        date: '2026-07-07',
        range: BookingRange.WEEK,
      });

      expect(result.expertId).toBe('expert-1');
      expect(result.sessionLengthHours).toBe(2);
      expect(result.range).toBe(BookingRange.WEEK);
      expect(result.days.every((d) => d.slots.length === 0)).toBe(true);
    });

    it('should generate hourly-stepped slots for availability blocks', async () => {
      const { service } = makeService({
        expert: makeExpert({ sessionLengthHours: 2 }),
        availability: [
          {
            id: 'av-1',
            expertId: 'expert-1',
            dayOfWeek: 2,
            startHour: 9,
            endHour: 18,
            expert: undefined as never,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      const result = await service.getAvailableSlots('expert-1', {
        date: '2026-07-07',
        range: BookingRange.WEEK,
      });

      const tuesday = result.days.find((d) => d.date === '2026-07-07');
      expect(tuesday).toBeDefined();
      expect(tuesday!.slots).toHaveLength(8);
      expect(tuesday!.slots.every((s) => s.available)).toBe(true);
      expect(new Date(tuesday!.slots[0].startAt).getUTCHours()).toBe(9);
      expect(new Date(tuesday!.slots[0].endAt).getUTCHours()).toBe(11);
    });

    it('should mark overlapping candidate starts unavailable when booked at 10:00', async () => {
      const { service } = makeService({
        expert: makeExpert({ sessionLengthHours: 2 }),
        availability: [
          {
            id: 'av-1',
            expertId: 'expert-1',
            dayOfWeek: 2,
            startHour: 9,
            endHour: 18,
            expert: undefined as never,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        consultations: [
          makeConsultation({
            status: ConsultationStatus.CONFIRMED,
            scheduledAt: new Date('2026-07-07T10:00:00.000Z'),
          }),
        ],
      });

      const result = await service.getAvailableSlots('expert-1', {
        date: '2026-07-07',
      });

      const tuesday = result.days.find((d) => d.date === '2026-07-07')!;
      const byStartHour = (hour: number) =>
        tuesday.slots.find((s) => new Date(s.startAt).getUTCHours() === hour)!;

      expect(byStartHour(9).available).toBe(false);
      expect(byStartHour(10).available).toBe(false);
      expect(byStartHour(11).available).toBe(false);
      expect(byStartHour(12).available).toBe(true);
      expect(byStartHour(16).available).toBe(true);
    });

    it('should use month range when requested', async () => {
      const { service } = makeService({
        expert: makeExpert({ sessionLengthHours: 1 }),
        availability: [],
      });

      const result = await service.getAvailableSlots('expert-1', {
        date: '2026-07-15',
        range: BookingRange.MONTH,
      });

      expect(result.range).toBe(BookingRange.MONTH);
      expect(result.from).toBe('2026-07-01');
      expect(result.to).toBe('2026-07-31');
      expect(result.days).toHaveLength(31);
    });

    it('should default to week range when range omitted', async () => {
      const { service } = makeService({
        expert: makeExpert(),
        availability: [],
      });

      const result = await service.getAvailableSlots('expert-1', {
        date: '2026-07-08',
      });

      expect(result.range).toBe(BookingRange.WEEK);
      expect(result.from).toBe('2026-07-06');
      expect(result.to).toBe('2026-07-12');
      expect(result.days).toHaveLength(7);
    });
  });

  describe('createBooking', () => {
    it('should create a PENDING consultation and auto-create customer when missing', async () => {
      const { service, consultationRepo, customerRepo } = makeService({
        expert: makeExpert(),
        availability: wednesdayAvailability,
        customer: null,
      });

      const result = await service.createBooking('user-customer-1', {
        expertId: 'expert-1',
        scheduledAt: FUTURE_SLOT,
        reason: 'Need help',
      });

      expect(customerRepo.create).toHaveBeenCalledWith({
        userId: 'user-customer-1',
      });
      expect(consultationRepo.save).toHaveBeenCalled();
      expect(result.status).toBe(ConsultationStatus.PENDING);
      expect(result.expertId).toBe('expert-1');
      expect(result.reason).toBe('Need help');
    });

    it('should reuse existing customer when found', async () => {
      const existing = makeCustomer();
      const { service, customerRepo } = makeService({
        expert: makeExpert(),
        availability: wednesdayAvailability,
        customer: existing,
      });

      await service.createBooking('user-customer-1', {
        expertId: 'expert-1',
        scheduledAt: FUTURE_SLOT,
      });

      expect(customerRepo.create).not.toHaveBeenCalled();
      expect(customerRepo.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-customer-1' },
        relations: ['user'],
      });
    });

    it('should throw NotFoundException when expert is missing', async () => {
      const { service } = makeService({ expert: null });

      await expect(
        service.createBooking('user-customer-1', {
          expertId: 'missing',
          scheduledAt: FUTURE_SLOT,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when scheduledAt is in the past', async () => {
      const { service } = makeService({
        expert: makeExpert(),
        availability: wednesdayAvailability,
      });

      await expect(
        service.createBooking('user-customer-1', {
          expertId: 'expert-1',
          scheduledAt: '2020-01-08T09:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when scheduledAt is not top-of-hour', async () => {
      const { service } = makeService({
        expert: makeExpert(),
        availability: wednesdayAvailability,
      });

      await expect(
        service.createBooking('user-customer-1', {
          expertId: 'expert-1',
          scheduledAt: '2030-01-08T09:30:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when scheduledAt is outside availability', async () => {
      const { service } = makeService({
        expert: makeExpert(),
        availability: [],
      });

      await expect(
        service.createBooking('user-customer-1', {
          expertId: 'expert-1',
          scheduledAt: FUTURE_SLOT,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when slot overlaps an active booking', async () => {
      const { service } = makeService({
        expert: makeExpert(),
        availability: wednesdayAvailability,
        consultations: [
          makeConsultation({
            status: ConsultationStatus.CONFIRMED,
            scheduledAt: new Date(FUTURE_SLOT),
          }),
        ],
      });

      await expect(
        service.createBooking('user-customer-1', {
          expertId: 'expert-1',
          scheduledAt: FUTURE_SLOT,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject booking when expert has no clinicId', async () => {
      const { service } = makeService({
        expert: makeExpert({ clinicId: '' as unknown as string }),
        availability: wednesdayAvailability,
      });

      await expect(
        service.createBooking('user-customer-1', {
          expertId: 'expert-1',
          scheduledAt: FUTURE_SLOT,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listMyBookings', () => {
    it('should return customer bookings when caller has customer role', async () => {
      const customer = makeCustomer();
      const consultation = makeConsultation({ customer });
      const { service } = makeService({
        customer,
        findAndCountResult: [[consultation], 1],
      });

      const result = await service.listMyBookings(
        'user-customer-1',
        [Role.Customer],
        { page: 1, limit: 20 },
      );

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.items[0].customerId).toBe('cust-1');
      expect(result.items[0].customerName).toBe('Jane Customer');
    });

    it('should return expert bookings when caller has expert role and no customer role', async () => {
      const expert = makeExpert({ userId: 'user-expert-1' });
      const consultation = makeConsultation({ expert });
      const { service, expertRepo } = makeService({
        expert,
        findAndCountResult: [[consultation], 1],
      });

      const result = await service.listMyBookings(
        'user-expert-1',
        [Role.Expert],
        {},
      );

      expect(expertRepo.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-expert-1' },
        relations: ['user', 'clinic'],
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].expertId).toBe('expert-1');
      expect(result.items[0].expertName).toBe('Dr. Expert');
      expect(result.items[0].expertSpecialization).toBe('DERMATOLOGY');
      expect(result.items[0].clinic).toEqual({
        id: 'clinic-1',
        name: 'GlowScan Clinic',
        address: '12 Nguyen Hue',
      });
    });

    it('should reject combining tab and status filters', async () => {
      const { service } = makeService({ customer: makeCustomer() });

      await expect(
        service.listMyBookings('user-customer-1', [Role.Customer], {
          tab: BookingTab.UPCOMING,
          status: ConsultationStatus.PENDING,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should apply upcoming tab filters (active statuses + scheduledAt >= now)', async () => {
      const customer = makeCustomer();
      const { service, consultationRepo } = makeService({
        customer,
        findAndCountResult: [[], 0],
      });

      await service.listMyBookings('user-customer-1', [Role.Customer], {
        tab: BookingTab.UPCOMING,
      });

      expect(consultationRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            customerId: 'cust-1',
            status: expect.anything(),
            scheduledAt: expect.anything(),
          }),
        }),
      );
    });

    it('should apply past tab as COMPLETED status', async () => {
      const customer = makeCustomer();
      const { service, consultationRepo } = makeService({
        customer,
        findAndCountResult: [[], 0],
      });

      await service.listMyBookings('user-customer-1', [Role.Customer], {
        tab: BookingTab.PAST,
      });

      expect(consultationRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            customerId: 'cust-1',
            status: ConsultationStatus.COMPLETED,
          }),
        }),
      );
    });

    it('should apply cancelled tab as CANCELLED status', async () => {
      const customer = makeCustomer();
      const { service, consultationRepo } = makeService({
        customer,
        findAndCountResult: [[], 0],
      });

      await service.listMyBookings('user-customer-1', [Role.Customer], {
        tab: BookingTab.CANCELLED,
      });

      expect(consultationRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            customerId: 'cust-1',
            status: ConsultationStatus.CANCELLED,
          }),
        }),
      );
    });

    it('should throw ForbiddenException when as=expert but caller lacks expert role', async () => {
      const { service } = makeService({ customer: makeCustomer() });

      await expect(
        service.listMyBookings('user-customer-1', [Role.Customer], {
          as: BookingPerspective.EXPERT,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when caller has no customer or expert role', async () => {
      const { service } = makeService({});

      await expect(
        service.listMyBookings('user-staff-1', [Role.Staff], {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return empty page when customer has no profile yet', async () => {
      const { service } = makeService({ customer: null });

      const result = await service.listMyBookings(
        'user-customer-1',
        [Role.Customer],
        {},
      );

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should return empty page when expert has no profile yet', async () => {
      const { service } = makeService({ expert: null });

      const result = await service.listMyBookings(
        'user-expert-1',
        [Role.Expert],
        { as: BookingPerspective.EXPERT },
      );

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });
  });
});
