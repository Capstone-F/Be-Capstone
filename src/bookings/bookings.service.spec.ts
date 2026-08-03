import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { Role } from '../auth/roles.enum';
import { ConsultationRequest } from '../consultations/consultation-request.entity';
import { ConsultationStatus, BookingCancelledBy } from '../consultations/enums';
import { Feedback } from '../consultations/feedback.entity';
import { Customer } from '../users/customer.entity';
import { Expert } from '../users/expert.entity';
import { BookingsService } from './bookings.service';
import { BookingPerspective, BookingRange, BookingTab } from './enums';
import { ExpertAvailability } from './expert-availability.entity';

const FUTURE_SLOT = '2030-01-09T09:00:00.000+07:00'; // Wednesday 09:00 GMT+7

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
  cancelledAt: null,
  cancelReason: null,
  cancelledBy: null,
  treatmentId: null,
  feeChargedVnd: null,
  paidTransactionId: null,
  isFollowUp: false,
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
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as Repository<Expert>;

    const availabilityRepo = {
      find: jest.fn().mockResolvedValue(options.availability ?? []),
    } as unknown as Repository<ExpertAvailability>;

    const consultationRepo = {
      find: jest.fn().mockResolvedValue(options.consultations ?? []),
      findOne: jest.fn().mockResolvedValue(null),
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

    const feedbackRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((data) => ({ id: 'fb-1', ...data })),
      save: jest.fn((data) =>
        Promise.resolve({
          ...data,
          id: data.id ?? 'fb-1',
          createdAt: new Date(),
        }),
      ),
      createQueryBuilder: jest.fn(() => {
        const qb = {
          innerJoin: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getRawOne: jest.fn().mockResolvedValue({ avg: '5.00' }),
        };
        return qb;
      }),
    } as unknown as Repository<Feedback>;

    const treatmentRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn(() => {
        const qb = {
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(null),
        };
        return qb;
      }),
    };

    const walletService = {
      debit: jest.fn().mockResolvedValue({ id: 'tx-1' }),
      credit: jest.fn().mockResolvedValue({ id: 'tx-refund-1' }),
    };

    const service = new BookingsService(
      expertRepo,
      availabilityRepo,
      consultationRepo,
      customerRepo,
      feedbackRepo,
      treatmentRepo as never,
      walletService as never,
    );

    return {
      service,
      expertRepo,
      availabilityRepo,
      consultationRepo,
      customerRepo,
      feedbackRepo,
      treatmentRepo,
      walletService,
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

    it('should open business-hour slots when expert has no availability configured', async () => {
      const { service } = makeService({
        expert: makeExpert({ sessionLengthHours: 2 }),
        availability: [],
      });

      const result = await service.getAvailableSlots('expert-1', {
        date: '2026-07-07',
        range: BookingRange.WEEK,
      });

      expect(result.expertId).toBe('expert-1');
      expect(result.sessionLengthHours).toBe(2);
      expect(result.range).toBe(BookingRange.WEEK);
      // business hours 09–20, sessionLengthHours=2 → starts 9..18 (10 slots) every day
      expect(result.days.every((d) => d.slots.length === 10)).toBe(true);
      const tuesday = result.days.find((d) => d.date === '2026-07-07')!;
      expect(tuesday.slots[0].startAt).toBe('2026-07-07T09:00:00.000+07:00');
      expect(tuesday.slots.at(-1)!.startAt).toBe(
        '2026-07-07T18:00:00.000+07:00',
      );
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
      expect(tuesday!.slots[0].startAt).toBe('2026-07-07T09:00:00.000+07:00');
      expect(tuesday!.slots[0].endAt).toBe('2026-07-07T11:00:00.000+07:00');
    });

    it('should mark overlapping candidate starts unavailable when booked at 10:00 GMT+7', async () => {
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
            scheduledAt: new Date('2026-07-07T10:00:00.000+07:00'),
          }),
        ],
      });

      const result = await service.getAvailableSlots('expert-1', {
        date: '2026-07-07',
      });

      const tuesday = result.days.find((d) => d.date === '2026-07-07')!;
      const byStartHour = (hour: number) =>
        tuesday.slots.find((s) =>
          s.startAt.startsWith(
            `2026-07-07T${String(hour).padStart(2, '0')}:00:00.000+07:00`,
          ),
        )!;

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

    it('should allow booking any business-hour top-of-hour slot when expert has no availability configured', async () => {
      const { service, consultationRepo } = makeService({
        expert: makeExpert(),
        availability: [],
      });

      const result = await service.createBooking('user-customer-1', {
        expertId: 'expert-1',
        scheduledAt: FUTURE_SLOT,
      });

      expect(consultationRepo.save).toHaveBeenCalled();
      expect(result.status).toBe(ConsultationStatus.PENDING);
    });

    it('should throw BadRequestException when scheduledAt is outside configured availability', async () => {
      const { service } = makeService({
        expert: makeExpert(),
        availability: wednesdayAvailability,
      });

      await expect(
        service.createBooking('user-customer-1', {
          expertId: 'expert-1',
          // Wednesday block is 09–18 GMT+7; 20:00 is outside
          scheduledAt: '2030-01-09T20:00:00.000+07:00',
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

  describe('confirmBooking', () => {
    it('should transition PENDING to CONFIRMED for the assigned expert', async () => {
      const expert = makeExpert();
      const consultation = makeConsultation({
        status: ConsultationStatus.PENDING,
        expertId: expert.id,
        expert,
        paidTransactionId: 'tx-1',
        feeChargedVnd: '300000',
      });
      const { service, consultationRepo } = makeService({ expert });
      (consultationRepo.findOne as jest.Mock).mockResolvedValue(consultation);
      (consultationRepo.save as jest.Mock).mockImplementation((data) =>
        Promise.resolve({
          ...data,
          createdAt: consultation.createdAt,
          updatedAt: new Date(),
        }),
      );

      const result = await service.confirmBooking(
        expert.userId,
        consultation.id,
      );

      expect(consultationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: consultation.id,
          status: ConsultationStatus.CONFIRMED,
        }),
      );
      expect(result.status).toBe(ConsultationStatus.CONFIRMED);
      expect(result.id).toBe(consultation.id);
      expect(result.clinic).toEqual({
        id: 'clinic-1',
        name: 'GlowScan Clinic',
        address: '12 Nguyen Hue',
      });
    });

    it('should reject confirm when booking is unpaid', async () => {
      const expert = makeExpert();
      const consultation = makeConsultation({
        status: ConsultationStatus.PENDING,
        expertId: expert.id,
        expert,
        isFollowUp: false,
        paidTransactionId: null,
      });
      const { service, consultationRepo } = makeService({ expert });
      (consultationRepo.findOne as jest.Mock).mockResolvedValue(consultation);

      await expect(
        service.confirmBooking(expert.userId, consultation.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException when caller has no expert profile', async () => {
      const { service } = makeService({ expert: null });

      await expect(
        service.confirmBooking('user-missing', 'c-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when booking does not exist', async () => {
      const { service, consultationRepo } = makeService({
        expert: makeExpert(),
      });
      (consultationRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.confirmBooking('user-1', 'missing-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when confirming another expert booking', async () => {
      const assigned = makeExpert({ id: 'expert-1', userId: 'user-1' });
      const caller = makeExpert({ id: 'expert-2', userId: 'user-2' });
      const consultation = makeConsultation({
        expertId: assigned.id,
        expert: assigned,
      });
      const { service, consultationRepo } = makeService({ expert: caller });
      (consultationRepo.findOne as jest.Mock).mockResolvedValue(consultation);

      await expect(
        service.confirmBooking(caller.userId, consultation.id),
      ).rejects.toThrow(ForbiddenException);
      expect(consultationRepo.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when status is not PENDING', async () => {
      const expert = makeExpert();
      const consultation = makeConsultation({
        status: ConsultationStatus.CONFIRMED,
        expertId: expert.id,
        expert,
      });
      const { service, consultationRepo } = makeService({ expert });
      (consultationRepo.findOne as jest.Mock).mockResolvedValue(consultation);

      await expect(
        service.confirmBooking(expert.userId, consultation.id),
      ).rejects.toThrow(BadRequestException);
      expect(consultationRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('cancelBooking', () => {
    it('should cancel PENDING booking for owning customer', async () => {
      const customer = makeCustomer();
      const consultation = makeConsultation({
        customerId: customer.id,
        customer,
        status: ConsultationStatus.PENDING,
      });
      const { service, consultationRepo, customerRepo } = makeService({
        customer,
        expert: makeExpert(),
      });
      (consultationRepo.findOne as jest.Mock).mockResolvedValue(consultation);
      (customerRepo.findOne as jest.Mock).mockResolvedValue(customer);

      const result = await service.cancelBooking(
        customer.userId,
        [Role.Customer],
        consultation.id,
        { reason: 'Changed plans' },
      );

      expect(result.status).toBe(ConsultationStatus.CANCELLED);
      expect(result.cancelReason).toBe('Changed plans');
      expect(result.cancelledBy).toBe(BookingCancelledBy.CUSTOMER);
      expect(result.cancelledAt).toBeTruthy();
    });

    it('should cancel CONFIRMED booking for assigned expert', async () => {
      const expert = makeExpert();
      const consultation = makeConsultation({
        expertId: expert.id,
        expert,
        status: ConsultationStatus.CONFIRMED,
      });
      const { service, consultationRepo } = makeService({ expert });
      (consultationRepo.findOne as jest.Mock).mockResolvedValue(consultation);

      const result = await service.cancelBooking(
        expert.userId,
        [Role.Expert],
        consultation.id,
        {},
      );

      expect(result.status).toBe(ConsultationStatus.CANCELLED);
      expect(result.cancelledBy).toBe(BookingCancelledBy.EXPERT);
      expect(result.cancelReason).toBeNull();
    });

    it('should throw ForbiddenException for unauthorized actor', async () => {
      const consultation = makeConsultation();
      const { service, consultationRepo } = makeService({});
      (consultationRepo.findOne as jest.Mock).mockResolvedValue(consultation);

      await expect(
        service.cancelBooking(
          'user-other',
          [Role.Customer, Role.Expert],
          consultation.id,
          {},
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when cancelling IN_PROGRESS', async () => {
      const expert = makeExpert();
      const consultation = makeConsultation({
        expertId: expert.id,
        expert,
        status: ConsultationStatus.IN_PROGRESS,
      });
      const { service, consultationRepo } = makeService({ expert });
      (consultationRepo.findOne as jest.Mock).mockResolvedValue(consultation);

      await expect(
        service.cancelBooking(
          expert.userId,
          [Role.Expert],
          consultation.id,
          {},
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('startBooking / completeBooking', () => {
    it('should start CONFIRMED booking and set startedAt', async () => {
      const expert = makeExpert();
      const consultation = makeConsultation({
        status: ConsultationStatus.CONFIRMED,
        expertId: expert.id,
        expert,
      });
      const { service, consultationRepo } = makeService({ expert });
      (consultationRepo.findOne as jest.Mock).mockResolvedValue(consultation);

      const result = await service.startBooking(expert.userId, consultation.id);

      expect(result.status).toBe(ConsultationStatus.IN_PROGRESS);
      expect(result.startedAt).toBeTruthy();
    });

    it('should complete IN_PROGRESS booking and set completedAt', async () => {
      const expert = makeExpert();
      const consultation = makeConsultation({
        status: ConsultationStatus.IN_PROGRESS,
        expertId: expert.id,
        expert,
        startedAt: new Date(),
      });
      const { service, consultationRepo } = makeService({ expert });
      (consultationRepo.findOne as jest.Mock).mockResolvedValue(consultation);

      const result = await service.completeBooking(
        expert.userId,
        consultation.id,
      );

      expect(result.status).toBe(ConsultationStatus.COMPLETED);
      expect(result.completedAt).toBeTruthy();
    });

    it('should reject start from PENDING', async () => {
      const expert = makeExpert();
      const consultation = makeConsultation({
        status: ConsultationStatus.PENDING,
        expertId: expert.id,
        expert,
      });
      const { service, consultationRepo } = makeService({ expert });
      (consultationRepo.findOne as jest.Mock).mockResolvedValue(consultation);

      await expect(
        service.startBooking(expert.userId, consultation.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject complete from CONFIRMED (start required)', async () => {
      const expert = makeExpert();
      const consultation = makeConsultation({
        status: ConsultationStatus.CONFIRMED,
        expertId: expert.id,
        expert,
      });
      const { service, consultationRepo } = makeService({ expert });
      (consultationRepo.findOne as jest.Mock).mockResolvedValue(consultation);

      await expect(
        service.completeBooking(expert.userId, consultation.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject start by another expert', async () => {
      const assigned = makeExpert({ id: 'expert-1', userId: 'user-1' });
      const caller = makeExpert({ id: 'expert-2', userId: 'user-2' });
      const consultation = makeConsultation({
        status: ConsultationStatus.CONFIRMED,
        expertId: assigned.id,
        expert: assigned,
      });
      const { service, consultationRepo } = makeService({ expert: caller });
      (consultationRepo.findOne as jest.Mock).mockResolvedValue(consultation);

      await expect(
        service.startBooking(caller.userId, consultation.id),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('submitFeedback', () => {
    it('should create feedback and refresh expert rating', async () => {
      const customer = makeCustomer();
      const expert = makeExpert({ rating: 0 });
      const consultation = makeConsultation({
        status: ConsultationStatus.COMPLETED,
        customerId: customer.id,
        customer,
        expertId: expert.id,
        expert,
        feedback: undefined as never,
      });
      const { service, consultationRepo, feedbackRepo, expertRepo } =
        makeService({ customer, expert });
      (consultationRepo.findOne as jest.Mock)
        .mockResolvedValueOnce(consultation)
        .mockResolvedValueOnce({
          ...consultation,
          feedback: {
            id: 'fb-1',
            consultationId: consultation.id,
            rating: 5,
            comment: 'Great',
          },
        });

      const result = await service.submitFeedback(
        customer.userId,
        consultation.id,
        {
          rating: 5,
          comment: 'Great',
        },
      );

      expect(feedbackRepo.save).toHaveBeenCalled();
      expect(expertRepo.update).toHaveBeenCalledWith(
        { id: expert.id },
        { rating: 5 },
      );
      expect(result.feedback).toEqual({ rating: 5, comment: 'Great' });
    });

    it('should throw ConflictException on duplicate feedback', async () => {
      const customer = makeCustomer();
      const consultation = makeConsultation({
        status: ConsultationStatus.COMPLETED,
        customerId: customer.id,
        customer,
        feedback: {
          id: 'fb-1',
          rating: 4,
          comment: null,
        } as ConsultationRequest['feedback'],
      });
      const { service, consultationRepo } = makeService({ customer });
      (consultationRepo.findOne as jest.Mock).mockResolvedValue(consultation);

      await expect(
        service.submitFeedback(customer.userId, consultation.id, { rating: 5 }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException when not COMPLETED', async () => {
      const customer = makeCustomer();
      const consultation = makeConsultation({
        status: ConsultationStatus.PENDING,
        customerId: customer.id,
        customer,
      });
      const { service, consultationRepo } = makeService({ customer });
      (consultationRepo.findOne as jest.Mock).mockResolvedValue(consultation);

      await expect(
        service.submitFeedback(customer.userId, consultation.id, { rating: 5 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException for non-owner', async () => {
      const consultation = makeConsultation({
        status: ConsultationStatus.COMPLETED,
      });
      const { service, consultationRepo } = makeService({});
      (consultationRepo.findOne as jest.Mock).mockResolvedValue(consultation);

      await expect(
        service.submitFeedback('other-user', consultation.id, { rating: 5 }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getMyBooking', () => {
    it('should return booking for owning customer including feedback', async () => {
      const customer = makeCustomer();
      const consultation = makeConsultation({
        customerId: customer.id,
        customer,
        status: ConsultationStatus.COMPLETED,
        feedback: {
          id: 'fb-1',
          rating: 4,
          comment: 'Nice',
        } as ConsultationRequest['feedback'],
      });
      const { service, consultationRepo } = makeService({ customer });
      (consultationRepo.findOne as jest.Mock).mockResolvedValue(consultation);

      const result = await service.getMyBooking(
        customer.userId,
        [Role.Customer],
        consultation.id,
      );

      expect(result.feedback).toEqual({ rating: 4, comment: 'Nice' });
    });

    it('should throw ForbiddenException for unrelated user', async () => {
      const consultation = makeConsultation();
      const { service, consultationRepo } = makeService({});
      (consultationRepo.findOne as jest.Mock).mockResolvedValue(consultation);

      await expect(
        service.getMyBooking('stranger', [Role.Customer], consultation.id),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
