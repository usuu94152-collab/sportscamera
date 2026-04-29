// Interpolates timer display for the controller side.
// receivedAt: performance.now() when snapshot was received
// timerDisplayMs: value in the snapshot at send time
export function interpolateTimerMs(
  timerDisplayMs: number,
  timerRunning: boolean,
  receivedAt: number
): number {
  if (!timerRunning) return timerDisplayMs;
  return timerDisplayMs + (performance.now() - receivedAt);
}
