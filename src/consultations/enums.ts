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

/**
 * Reason code for penalised cancels: stamped by the SYSTEM sweep
 * (CONFIRM_TIMEOUT / EXPERT_NO_SHOW) or on a manual expert cancel inside the
 * late-cancel threshold (EXPERT_LATE_CANCEL). NO_SHOW and LATE_CANCEL unlock
 * customer feedback and count as no-show-grade violations on the report.
 */
export enum BookingAutoCancelReason {
  /** Expert never confirmed a paid PENDING booking within the confirm window. */
  CONFIRM_TIMEOUT = 'CONFIRM_TIMEOUT',
  /** Expert confirmed but never started the session after scheduledAt + grace. */
  EXPERT_NO_SHOW = 'EXPERT_NO_SHOW',
  /** Expert cancelled manually within the late-cancel threshold before the slot. */
  EXPERT_LATE_CANCEL = 'EXPERT_LATE_CANCEL',
}
