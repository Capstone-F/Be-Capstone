export enum RoutineType {
  AI_RECOMMENDED = 'AI_RECOMMENDED',
  EXPERT_PRESCRIBED = 'EXPERT_PRESCRIBED',
}

export enum RoutinePeriod {
  MORNING = 'MORNING',
  EVENING = 'EVENING',
}

export enum RoutineStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
}

export enum SideEffectType {
  PEELING = 'PEELING',
  REDNESS = 'REDNESS',
  BREAKOUT = 'BREAKOUT',
  BLISTERS = 'BLISTERS',
  BURNING = 'BURNING',
  ITCHING = 'ITCHING',
}

export enum SupportHabitType {
  FACE_YOGA = 'FACE_YOGA',
  FACIAL_MASSAGE = 'FACIAL_MASSAGE',
  HYDRATION = 'HYDRATION',
  SLEEP = 'SLEEP',
}

/** Stored outcome on a step completion row. PENDING is derived when no row exists. */
export enum StepCompletionStatus {
  COMPLETED = 'COMPLETED',
  SKIPPED = 'SKIPPED',
}

export enum StepSessionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  SKIPPED = 'SKIPPED',
}

export enum SkipReason {
  OUT_OF_STOCK = 'OUT_OF_STOCK',
  FORGOT = 'FORGOT',
  OTHER = 'OTHER',
}

export enum CheckInMood {
  GOOD = 'GOOD',
  OK = 'OK',
  BAD = 'BAD',
}

export enum SessionState {
  EMPTY = 'EMPTY',
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  MISSED = 'MISSED',
}

export enum DayHistoryStatus {
  COMPLETED = 'COMPLETED',
  PARTIAL = 'PARTIAL',
  MISSED = 'MISSED',
  NOT_STARTED = 'NOT_STARTED',
}

export enum EmptyRoutineReason {
  NO_ACTIVE_ROUTINE = 'NO_ACTIVE_ROUTINE',
}
