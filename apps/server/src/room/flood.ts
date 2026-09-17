/**
 * Flood protection (docs/architecture/security.md, "Flood protection and socket costs"). Every
 * socket, the host's included, has a token bucket of 20 messages per second with a burst of 40.
 *
 * The bucket lives in socket state, so it survives hibernation without a storage write. It has no
 * timer: tokens refill from the time since the last frame, computed when the next frame arrives.
 * Counting a frame is O(1).
 */

/** Tokens added per second. */
export const floodRatePerSecond = 20;

/** Most tokens a bucket holds, so the most frames a socket can send at once. */
export const floodBurst = 40;

export interface FloodBucket {
  /** Tokens left at `at`. May be fractional. */
  tokens: number;
  /** Room time the bucket last counted a frame. */
  at: number;
}

/** A full bucket, for a socket that just connected. */
export function fullBucket(now: number): FloodBucket {
  return { tokens: floodBurst, at: now };
}

/**
 * Counts one frame that reached the message handler at room time `now`. Returns the bucket after
 * it, or null when the bucket is empty and the socket is flooding.
 */
export function takeToken(bucket: FloodBucket, now: number): FloodBucket | null {
  const elapsed = Math.max(0, now - bucket.at);
  const tokens = Math.min(floodBurst, bucket.tokens + (elapsed * floodRatePerSecond) / 1000);
  if (tokens < 1) return null;
  return { tokens: tokens - 1, at: Math.max(now, bucket.at) };
}
