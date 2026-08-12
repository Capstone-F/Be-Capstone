/**
 * Happy-path GHN statuses walked by the sandbox delivery simulator.
 *
 * Each string is a key of GHN_STATUS_MAP so the apply path exercises the same
 * mapping production webhooks use. Intermediate in-transit statuses are
 * abbreviated (storing / money_collect_* omitted) to keep demos short.
 */
export const SIMULATED_HAPPY_PATH = [
  'ready_to_pick',
  'picking',
  'picked',
  'transporting',
  'sorting',
  'delivering',
  'delivered',
] as const;

export type SimulatedHappyPathStatus = (typeof SIMULATED_HAPPY_PATH)[number];

/**
 * Next status on the happy path, or null when the current status is already
 * at the end or not on the sequence (e.g. after a forced failure/return).
 */
export function nextSimulatedStatus(current: string | null): string | null {
  if (current === null) {
    return SIMULATED_HAPPY_PATH[0];
  }
  const index = SIMULATED_HAPPY_PATH.indexOf(
    current as SimulatedHappyPathStatus,
  );
  if (index < 0 || index >= SIMULATED_HAPPY_PATH.length - 1) {
    return null;
  }
  return SIMULATED_HAPPY_PATH[index + 1];
}
