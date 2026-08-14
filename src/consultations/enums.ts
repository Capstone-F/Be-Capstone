export enum ConsultationStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/** Who cancelled a consultation request (Doc2 Cancelled state). */
export enum BookingCancelledBy {
  CUSTOMER = 'CUSTOMER',
  EXPERT = 'EXPERT',
  /** Cron-driven auto-cancel; pair with BookingAutoCancelReason. */
  SYSTEM = 'SYSTEM',
}

/** Why the system auto-cancelled a booking (only set when cancelledBy = SYSTEM). */
export enum BookingAutoCancelReason {
  /** Expert never confirmed a paid PENDING booking within the confirm window. */
  CONFIRM_TIMEOUT = 'CONFIRM_TIMEOUT',
  /** Expert confirmed but never started the session after scheduledAt + grace. */
  EXPERT_NO_SHOW = 'EXPERT_NO_SHOW',
}
