/** BullMQ states that mean the worker may still pick up the job. */
const IN_FLIGHT = new Set([
  'waiting',
  'active',
  'delayed',
  'paused',
  'waiting-children',
]);

export function redisJobIsInFlight(
  state: string | null | undefined,
): boolean {
  return !!state && IN_FLIGHT.has(state);
}
