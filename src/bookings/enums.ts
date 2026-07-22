export enum BookingRange {
  WEEK = 'week',
  MONTH = 'month',
}

export enum BookingPerspective {
  CUSTOMER = 'customer',
  EXPERT = 'expert',
}

/** List tabs for GET /bookings/me */
export enum BookingTab {
  UPCOMING = 'upcoming',
  PAST = 'past',
  CANCELLED = 'cancelled',
}
