export const DELIVERY_SIMULATION_TICK_CRON_DEFAULT = '*/15 * * * * *';

export type DeliverySimulationConfig = {
  /** When false, the @Cron handler is a no-op (production default; enable for sandbox/demo). */
  cronEnabled: boolean;
  /** Cron expression for the simulator tick. */
  tickCron: string;
  /** Seconds to wait between simulated GHN status steps. */
  stepDelaySec: number;
  /** Max deliveries claimed per tick. */
  batchSize: number;
};
