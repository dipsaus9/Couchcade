/**
 * The offset estimate from docs/architecture/platform.md, "Clock sync". Pure functions over
 * ping/pong samples, with no clock or timer of their own.
 */

/** Fewest samples an offset is estimated from. */
export const minClockSamples = 5;

/** One ping/pong round trip. */
export interface ClockSample {
  /** Round trip in local milliseconds: `t3 - t0`. */
  rttMs: number;
  /** Room time minus local time: `t1 - (t0 + t3) / 2`. */
  offsetMs: number;
}

/**
 * Turns one round trip into a sample. `t0` is the local time the ping was sent, `t1` the room time
 * the room received it, and `t3` the local time the pong arrived.
 *
 * The offset assumes the ping and the pong took equally long. When they don't, it is off by half
 * the difference, so a single sample over a lopsided path is never trusted on its own.
 */
export function clockSampleOf(t0: number, t1: number, t3: number): ClockSample {
  return { rttMs: t3 - t0, offsetMs: t1 - (t0 + t3) / 2 };
}

function median(sorted: readonly number[]): number {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

/**
 * Estimates room time minus local time, or `null` with fewer than 5 samples.
 *
 * Slow round trips are the ones most likely to be lopsided (a retransmit, a busy radio), so
 * samples with a round trip above the median plus one standard deviation are dropped. The
 * estimate is the median offset of the rest, which one remaining odd sample can't pull.
 */
export function estimateClockOffset(samples: readonly ClockSample[]): number | null {
  if (samples.length < minClockSamples) return null;

  const rtts = samples.map((sample) => sample.rttMs).toSorted((a, b) => a - b);
  const mean = rtts.reduce((sum, rtt) => sum + rtt, 0) / rtts.length;
  const deviation = Math.sqrt(rtts.reduce((sum, rtt) => sum + (rtt - mean) ** 2, 0) / rtts.length);
  const limit = median(rtts) + deviation;

  // The lower middle round trip is at most the median, so at least one sample always stays.
  const offsets = samples
    .filter((sample) => sample.rttMs <= limit)
    .map((sample) => sample.offsetMs)
    .toSorted((a, b) => a - b);
  return median(offsets);
}
