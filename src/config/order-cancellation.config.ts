export const ORDER_CANCELLATION_TICK_CRON_DEFAULT = '*/15 * * * * *';

export type OrderCancellationConfig = {
  /** When false, the @Cron handler is a no-op (e2e / demo-only). */
  cronEnabled: boolean;
  /** Cron expression for the processor tick. */
  tickCron: string;
  /** Seconds to wait between pipeline stages (makes the flow look gradual). */
  stepDelaySec: number;
  /** Max cancellations claimed per tick. */
  batchSize: number;
};
