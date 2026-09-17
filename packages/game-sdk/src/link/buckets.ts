/**
 * TV-side link limits, from docs/architecture/realtime-link.md, "TV-side limits on the link". Two
 * token buckets per phone, one per channel, plus a rolling cut-off count. "The buckets refill
 * from arrival times, with no timer": there is no `setInterval` here, only arithmetic on the
 * timestamp of each call.
 */

export interface TokenBucketOptions {
  /** Tokens added per second. */
  ratePerSecond: number;
  /** Tokens the bucket can hold, and how many a burst may spend at once. */
  burst: number;
}

export interface TokenBucket {
  /** Attempts to take one token at `atMs`. `true` if there was one, `false` if the bucket was empty. */
  take(atMs: number): boolean;
}

/** A generic token bucket, refilled by elapsed time between calls rather than by a timer. */
export function createTokenBucket({ ratePerSecond, burst }: TokenBucketOptions): TokenBucket {
  let tokens = burst;
  let lastMs: number | null = null;

  return {
    take(atMs) {
      if (lastMs !== null && atMs > lastMs) {
        tokens = Math.min(burst, tokens + ((atMs - lastMs) / 1_000) * ratePerSecond);
      }
      lastMs = atMs;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
  };
}

/** `cc-stream`: two streams at 60 per second plus pings (Channels, messages and rates). */
export const streamRatePerSecond = 130;
export const streamBurst = 40;
/** `cc-events`. */
export const eventsRatePerSecond = 20;
export const eventsBurst = 20;
/** More than this many drops within `cutoffWindowMs` reports the peer as cut off. */
export const cutoffDropThreshold = 100;
export const cutoffWindowMs = 10_000;

export type LinkChannel = "stream" | "events";

export interface LinkGuard {
  /**
   * Admits or drops one frame on `channel` at `atMs`. A drop counts toward the cut-off window;
   * `cutOff` reflects the count as of the most recent call.
   */
  admit(channel: LinkChannel, atMs: number): boolean;
  /** More than `cutoffDropThreshold` frames were dropped within the last `cutoffWindowMs`. */
  readonly cutOff: boolean;
}

/** One phone's link limits: its `cc-stream` and `cc-events` buckets, and the shared cut-off count. */
export function createLinkGuard(): LinkGuard {
  const stream = createTokenBucket({ ratePerSecond: streamRatePerSecond, burst: streamBurst });
  const events = createTokenBucket({ ratePerSecond: eventsRatePerSecond, burst: eventsBurst });
  let drops: number[] = [];

  return {
    admit(channel, atMs) {
      const allowed = channel === "stream" ? stream.take(atMs) : events.take(atMs);
      if (!allowed) drops.push(atMs);
      drops = drops.filter((droppedAt) => droppedAt > atMs - cutoffWindowMs);
      return allowed;
    },
    get cutOff() {
      return drops.length > cutoffDropThreshold;
    },
  };
}
