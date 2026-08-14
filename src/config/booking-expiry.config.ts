export const BOOKING_EXPIRY_TICK_CRON_DEFAULT = '0 * * * * *';

export type BookingExpiryConfig = {
  /** When false, the @Cron handler is a no-op (e2e / demo-only manual tick). */
  cronEnabled: boolean;
  /** Cron expression for the expiry sweep. */
  tickCron: string;
  /**
   * Minutes a PENDING booking may wait for expert confirm before auto-cancel.
   * The sweep also fires once scheduledAt passes, whichever comes first.
   */
  confirmTimeoutMin: number;
  /** Minutes after scheduledAt a CONFIRMED booking may sit un-started before no-show cancel. */
  noShowGraceMin: number;
  /** Max bookings auto-cancelled per tick. */
  batchSize: number;
};
