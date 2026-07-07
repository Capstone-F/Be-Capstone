import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ConsultationRequest } from '../consultations/consultation-request.entity';
import { ConsultationStatus } from '../consultations/enums';
import { Expert } from '../users/expert.entity';
import { BookingsService } from './bookings.service';
import { BookingRange } from './enums';
import { ExpertAvailability } from './expert-availability.entity';

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
  user: undefined as never,
  clinic: null,
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
  }) {
    const expertRepo = {
      findOne: jest.fn().mockResolvedValue(options.expert ?? null),
    } as unknown as Repository<Expert>;

    const availabilityRepo = {
      find: jest.fn().mockResolvedValue(options.availability ?? []),
    } as unknown as Repository<ExpertAvailability>;

    const consultationRepo = {
      find: jest.fn().mockResolvedValue(options.consultations ?? []),
    } as unknown as Repository<ConsultationRequest>;

    const service = new BookingsService(
      expertRepo,
      availabilityRepo,
      consultationRepo,
    );

    return { service, expertRepo, availabilityRepo, consultationRepo };
  }

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
          dayOfWeek: 2, // Tuesday 2026-07-07
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
        {
          id: 'c-1',
          customerId: 'cust-1',
          expertId: 'expert-1',
          reason: null,
          status: ConsultationStatus.CONFIRMED,
          scheduledAt: new Date('2026-07-07T10:00:00.000Z'),
          startedAt: null,
          completedAt: null,
          customer: undefined as never,
          expert: undefined as never,
          chatHistory: [],
          feedback: undefined as never,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
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
