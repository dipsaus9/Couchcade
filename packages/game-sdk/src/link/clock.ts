/**
 * Link clock maths, from docs/architecture/realtime-link.md, "Refining a phone's clock over the
 * link". Each `link:ping`/`link:pong` gives four timestamps, like NTP: `t0` phone send, `t1` host
 * receive, `t2` host send, `t3` phone receive. Pure maths only; the caller owns the ping/pong
 * exchange, the filtering window and the room clock offset `r` the host reports in its pong.
 */

/** The four timestamps of one `link:ping`/`link:pong` round trip, all on their own device's clock. */
export interface LinkPingPong {
  readonly t0: number;
  readonly t1: number;
  readonly t2: number;
  readonly t3: number;
}

export interface LinkClockSample {
  /** Round trip in local milliseconds: `(t3 - t0) - (t2 - t1)`. Exact regardless of asymmetry. */
  readonly rttMs: number;
  /**
   * Phone to host offset: `((t1 - t0) + (t2 - t3)) / 2`. Assumes the ping and the pong took
   * equally long; when the path is asymmetric this is off by half the difference between the two
   * one-way delays, same as the room clock's own sample (clock/estimate.ts).
   */
  readonly offsetPHMs: number;
}

/** Turns one link ping/pong round trip into a round trip and a phone-to-host offset sample. */
export function linkClockSampleOf({ t0, t1, t2, t3 }: LinkPingPong): LinkClockSample {
  return { rttMs: t3 - t0 - (t2 - t1), offsetPHMs: (t1 - t0 + (t2 - t3)) / 2 };
}

/**
 * Phone to room offset: the phone-to-host offset plus the host's own room clock offset `r` (its
 * `roomClock.offsetMs` at pong time). While direct, a phone uses this instead of its periodic
 * relay clock sample (rule 1 under "Refining a phone's clock over the link").
 */
export function linkOffsetToRoom(offsetPHMs: number, roomOffsetMs: number): number {
  return offsetPHMs + roomOffsetMs;
}
