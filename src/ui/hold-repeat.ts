/** Wait before a held key starts repeating. */
export const HOLD_DELAY_MS = 400;
/** Interval of the first repeat; each next one is shorter, down to the minimum. */
const FIRST_INTERVAL_MS = 120;
const ACCELERATION = 0.85;
export const MIN_INTERVAL_MS = 25;

/** Delay before repeat number `n`. n = 0 is the wait after the initial press. */
export function repeatDelay(n: number): number {
  if (n <= 0) return HOLD_DELAY_MS;
  return Math.max(MIN_INTERVAL_MS, FIRST_INTERVAL_MS * ACCELERATION ** (n - 1));
}

/**
 * Runs `action` now and, while held, again and again, faster each time.
 * Returns the function that stops it. The timer drives a UI gesture, not music.
 */
export function holdRepeat(action: () => void): () => void {
  let repeats = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fire = (): void => {
    action();
    timer = setTimeout(fire, repeatDelay(repeats++));
  };
  fire();
  return () => clearTimeout(timer);
}
