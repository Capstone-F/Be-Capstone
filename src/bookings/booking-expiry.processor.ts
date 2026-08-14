import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppConfigService } from '../config/config.service';
import { BOOKING_EXPIRY_TICK_CRON_DEFAULT } from '../config/booking-expiry.config';
import { ConsultationRequest } from '../consultations/consultation-request.entity';
import {
  BookingAutoCancelReason,
  ConsultationStatus,
} from '../consultations/enums';
import { BookingsService } from './bookings.service';

export type BookingExpiryTickOptions = {
  /** Restrict the sweep to a single booking (demo / unstick). */
  bookingId?: string;
  /**
   * Ignore the configured deadlines and cancel the booking as soon as it sits
   * in a sweepable status. Only honoured together with bookingId.
   */
  ignoreDeadline?: boolean;
};

export type BookingExpiryTickResult = {
  /** Booking ids cancelled because the expert never confirmed. */
  confirmTimedOut: string[];
  /** Booking ids cancelled because the expert never started the session. */
  expertNoShow: string[];
  /** Candidates another actor (manual cancel / confirm / start) claimed first. */
  skipped: number;
};

/**
 * Sweeps bookings that stall in a waiting state and cancels them with a refund:
 *
 * - `PENDING` past the confirm window (or past its own `scheduledAt`) — the
 *   expert never answered, so the customer should not stay locked in.
 * - `CONFIRMED` past `scheduledAt + grace` with no `startedAt` — expert no-show.
 *   These stay rateable: the customer can still post feedback afterwards.
 */
@Injectable()
export class BookingExpiryProcessor {
  private readonly logger = new Logger(BookingExpiryProcessor.name);

  constructor(
    @InjectRepository(ConsultationRequest)
    private readonly consultationRepository: Repository<ConsultationRequest>,
    private readonly bookingsService: BookingsService,
    private readonly config: AppConfigService,
  ) {}

  @Cron(
    process.env.BOOKING_EXPIRY_TICK_CRON || BOOKING_EXPIRY_TICK_CRON_DEFAULT,
    {
      name: 'booking-expiry-tick',
    },
  )
  async handleCron(): Promise<void> {
    if (!this.config.bookingExpiryConfig.cronEnabled) {
      return;
    }
    try {
      await this.tick();
    } catch (error) {
      this.logger.error(
        'Booking expiry tick failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async tick(
    options: BookingExpiryTickOptions = {},
  ): Promise<BookingExpiryTickResult> {
    const result: BookingExpiryTickResult = {
      confirmTimedOut: [],
      expertNoShow: [],
      skipped: 0,
    };
    // Deadlines only apply to a broad sweep; a targeted admin call may skip them.
    const ignoreDeadline = !!options.ignoreDeadline && !!options.bookingId;

    const staleConfirms = await this.findStalePending(
      options.bookingId,
      ignoreDeadline,
    );
    for (const booking of staleConfirms) {
      const cancelled = await this.cancelSafely(
        booking,
        BookingAutoCancelReason.CONFIRM_TIMEOUT,
      );
      if (cancelled) {
        result.confirmTimedOut.push(booking.id);
      } else {
        result.skipped += 1;
      }
    }

    const noShows = await this.findExpertNoShows(
      options.bookingId,
      ignoreDeadline,
    );
    for (const booking of noShows) {
      const cancelled = await this.cancelSafely(
        booking,
        BookingAutoCancelReason.EXPERT_NO_SHOW,
      );
      if (cancelled) {
        result.expertNoShow.push(booking.id);
      } else {
        result.skipped += 1;
      }
    }

    return result;
  }

  /**
   * PENDING bookings the expert never confirmed: either the confirm window
   * elapsed, or the slot itself has come and gone.
   */
  private async findStalePending(
    bookingId: string | undefined,
    ignoreDeadline: boolean,
  ): Promise<ConsultationRequest[]> {
    const { confirmTimeoutMin, batchSize } = this.config.bookingExpiryConfig;
    const now = new Date();
    const createdBefore = new Date(now.getTime() - confirmTimeoutMin * 60_000);

    const qb = this.consultationRepository
      .createQueryBuilder('c')
      .where('c.status = :status', { status: ConsultationStatus.PENDING })
      .orderBy('c.scheduledAt', 'ASC')
      .take(batchSize);

    if (!ignoreDeadline) {
      qb.andWhere(
        '(c.createdAt <= :createdBefore OR (c.scheduledAt IS NOT NULL AND c.scheduledAt <= :now))',
        { createdBefore, now },
      );
    }
    if (bookingId) {
      qb.andWhere('c.id = :bookingId', { bookingId });
    }

    return qb.getMany();
  }

  /** CONFIRMED bookings the expert never started past scheduledAt + grace. */
  private async findExpertNoShows(
    bookingId: string | undefined,
    ignoreDeadline: boolean,
  ): Promise<ConsultationRequest[]> {
    const { noShowGraceMin, batchSize } = this.config.bookingExpiryConfig;
    const startDeadline = new Date(Date.now() - noShowGraceMin * 60_000);

    const qb = this.consultationRepository
      .createQueryBuilder('c')
      .where('c.status = :status', { status: ConsultationStatus.CONFIRMED })
      .andWhere('c.startedAt IS NULL')
      .orderBy('c.scheduledAt', 'ASC')
      .take(batchSize);

    if (!ignoreDeadline) {
      qb.andWhere('c.scheduledAt IS NOT NULL').andWhere(
        'c.scheduledAt <= :startDeadline',
        { startDeadline },
      );
    }
    if (bookingId) {
      qb.andWhere('c.id = :bookingId', { bookingId });
    }

    return qb.getMany();
  }

  private async cancelSafely(
    booking: ConsultationRequest,
    reason: BookingAutoCancelReason,
  ): Promise<boolean> {
    try {
      const cancelled = await this.bookingsService.autoCancelBooking(
        booking.id,
        reason,
      );
      if (cancelled) {
        this.logger.log(`Auto-cancelled booking ${booking.id} (${reason})`);
      }
      return cancelled;
    } catch (error) {
      this.logger.error(
        `Failed to auto-cancel booking ${booking.id} (${reason}): ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      return false;
    }
  }
}
