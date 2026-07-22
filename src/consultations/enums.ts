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
}
