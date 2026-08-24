import { Repository } from 'typeorm';
import { AppConfigService } from '../config/config.service';
import { ConsultationRequest } from '../consultations/consultation-request.entity';
import {
  BookingAutoCancelReason,
  ConsultationStatus,
} from '../consultations/enums';
import { BookingExpiryProcessor } from './booking-expiry.processor';
import { BookingSettingsService } from './booking-settings.service';
import { BookingsService } from './bookings.service';

type QbCall = { sql: string; params?: Record<string, unknown> };

function makeProcessor(
  options: {
    pending?: Partial<ConsultationRequest>[];
    confirmed?: Partial<ConsultationRequest>[];
    cronEnabled?: boolean;
    autoCancel?: jest.Mock;
  } = {},
) {
  const calls: QbCall[][] = [];

  const consultationRepo = {
    createQueryBuilder: jest.fn(() => {
      const qbCalls: QbCall[] = [];
      calls.push(qbCalls);
      const qb = {
        where: jest.fn((sql: string, params?: Record<string, unknown>) => {
          qbCalls.push({ sql, params });
          return qb;
        }),
        andWhere: jest.fn((sql: string, params?: Record<string, unknown>) => {
          qbCalls.push({ sql, params });
          return qb;
        }),
        orderBy: jest.fn(() => qb),
        take: jest.fn(() => qb),
        getMany: jest.fn(() => {
          const isPending = qbCalls.some(
            (c) => c.params?.status === ConsultationStatus.PENDING,
          );
          return Promise.resolve(
            isPending ? (options.pending ?? []) : (options.confirmed ?? []),
          );
        }),
      };
      return qb;
    }),
  } as unknown as Repository<ConsultationRequest>;

  const autoCancelBooking =
    options.autoCancel ?? jest.fn().mockResolvedValue(true);
  const bookingsService = { autoCancelBooking } as unknown as BookingsService;

  const config = {
    bookingExpiryConfig: {
      cronEnabled: options.cronEnabled ?? true,
      tickCron: '0 * * * * *',
      confirmTimeoutMin: 1440,
      noShowGraceMin: 15,
      batchSize: 20,
    },
  } as unknown as AppConfigService;

  const bookingSettings = {
    getSettings: jest.fn().mockResolvedValue({
      confirmTimeoutMin: 1440,
      noShowGraceMin: 15,
      minLeadTimeMin: 120,
    }),
  } as unknown as BookingSettingsService;

  const processor = new BookingExpiryProcessor(
    consultationRepo,
    bookingsService,
    config,
    bookingSettings,
  );

  return {
    processor,
    autoCancelBooking,
    calls,
    consultationRepo,
    bookingSettings,
  };
}

describe('BookingExpiryProcessor', () => {
  afterEach(() => jest.clearAllMocks());

  it('should auto-cancel stale PENDING bookings as CONFIRM_TIMEOUT', async () => {
    const { processor, autoCancelBooking } = makeProcessor({
      pending: [{ id: 'c-pending' }],
    });

    const result = await processor.tick();

    expect(autoCancelBooking).toHaveBeenCalledWith(
      'c-pending',
      BookingAutoCancelReason.CONFIRM_TIMEOUT,
    );
    expect(result.confirmTimedOut).toEqual(['c-pending']);
    expect(result.skipped).toBe(0);
  });

  it('should auto-cancel un-started CONFIRMED bookings as EXPERT_NO_SHOW', async () => {
    const { processor, autoCancelBooking } = makeProcessor({
      confirmed: [{ id: 'c-noshow' }],
    });

    const result = await processor.tick();

    expect(autoCancelBooking).toHaveBeenCalledWith(
      'c-noshow',
      BookingAutoCancelReason.EXPERT_NO_SHOW,
    );
    expect(result.expertNoShow).toEqual(['c-noshow']);
  });

  it('should count a booking another actor claimed first as skipped', async () => {
    const { processor } = makeProcessor({
      pending: [{ id: 'c-pending' }],
      autoCancel: jest.fn().mockResolvedValue(false),
    });

    const result = await processor.tick();

    expect(result.confirmTimedOut).toEqual([]);
    expect(result.skipped).toBe(1);
  });

  it('should swallow a per-booking failure and keep sweeping', async () => {
    const autoCancel = jest
      .fn()
      .mockRejectedValueOnce(new Error('refund exploded'))
      .mockResolvedValue(true);
    const { processor } = makeProcessor({
      pending: [{ id: 'c-bad' }],
      confirmed: [{ id: 'c-noshow' }],
      autoCancel,
    });

    const result = await processor.tick();

    expect(result.skipped).toBe(1);
    expect(result.expertNoShow).toEqual(['c-noshow']);
  });

  it('should apply the confirm and no-show deadlines by default', async () => {
    const { processor, calls } = makeProcessor({});

    await processor.tick();

    const [pendingCalls, confirmedCalls] = calls;
    expect(
      pendingCalls.some((c) => c.sql.includes('c.createdAt <= :createdBefore')),
    ).toBe(true);
    expect(
      confirmedCalls.some((c) =>
        c.sql.includes('c.scheduledAt <= :startDeadline'),
      ),
    ).toBe(true);
  });

  it('should drop the deadlines only when a bookingId is targeted', async () => {
    const { processor, calls } = makeProcessor({});

    await processor.tick({ bookingId: 'c-1', ignoreDeadline: true });

    const [pendingCalls] = calls;
    expect(pendingCalls.some((c) => c.sql.includes(':createdBefore'))).toBe(
      false,
    );
    expect(pendingCalls.some((c) => c.params?.bookingId === 'c-1')).toBe(true);
  });

  it('should keep the deadlines when ignoreDeadline arrives without a bookingId', async () => {
    const { processor, calls } = makeProcessor({});

    await processor.tick({ ignoreDeadline: true });

    const [pendingCalls] = calls;
    expect(pendingCalls.some((c) => c.sql.includes(':createdBefore'))).toBe(
      true,
    );
  });

  it('should no-op the cron handler when the sweep is disabled', async () => {
    const { processor, consultationRepo } = makeProcessor({
      cronEnabled: false,
    });

    await processor.handleCron();

    expect(consultationRepo.createQueryBuilder).not.toHaveBeenCalled();
  });
});
