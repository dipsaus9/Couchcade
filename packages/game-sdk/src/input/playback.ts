/**
 * Generic stream playback with prediction, from docs/architecture/realtime-link.md, "Fallback
 * detection and smoothing". Works on any numeric-tuple stream, not only aim: interpolates between
 * samples, holds across a gap instead of creeping, briefly predicts past the newest sample when a
 * message is late, catches up without a jump when a fresher value arrives, and snaps to an exact
 * value (a shot's aim) over a short tween. `aim-playback.ts`'s `aimAt` is a thin wrapper over this
 * for the transition period before every game moves to `createPlayback` directly (CC-11.9).
 *
 * ```ts
 * let track = addSample([], sampleAtMs, [yaw, pitch]);
 * const playback = createPlayback<[number, number]>();
 * // Each frame: const [yaw, pitch] = playback.at(track, nowMs, delayMs, frameMs) ?? [0, 0];
 * // On a shot: playback.snap([shotYaw, shotPitch]);
 * ```
 */

/** One point on a track: game time, then the stream's values. */
export type Sample<V extends readonly number[]> = readonly [atMs: number, ...values: V];
/** A stream's received samples, oldest first. Plain JSON, safe to keep in `TState`. */
export type SampleTrack<V extends readonly number[]> = readonly Sample<V>[];

/** Points a track keeps by default. */
export const PLAYBACK_MAX_POINTS = 64;

/**
 * Returns a new track with one sample added. Pure and JSON-safe. Non-finite `atMs` or values are
 * ignored. A sample at a time the track already has replaces that point. The track keeps its
 * newest `maxPoints` points, oldest first.
 */
export function addSample<V extends readonly number[]>(
  track: SampleTrack<V>,
  atMs: number,
  values: V,
  maxPoints: number = PLAYBACK_MAX_POINTS,
): SampleTrack<V> {
  if (!Number.isFinite(atMs) || !values.every((value) => Number.isFinite(value))) return track;
  const sample = [atMs, ...values] as unknown as Sample<V>;
  return [...track.filter((existing) => existing[0] !== atMs), sample]
    .toSorted((a, b) => a[0] - b[0])
    .slice(-maxPoints);
}

export interface PlaybackOptions {
  /** How far past the newest sample to keep predicting, in ms. Default 100. */
  predictMs?: number;
  /** The prediction's ease-out time constant, in ms. Default 60. */
  tauMs?: number;
  /** How fast the drawn value catches up to a corrected target, in ms. Default 50. */
  catchUpMs?: number;
  /**
   * The stream's nominal spacing between fresh samples, in ms: tells a real gap (the phone was
   * held still, or a message went missing) from ordinary cadence, so a gap is held at the older
   * sample instead of creeping across it. Defaults to the track's own median sample spacing, which
   * needs a few samples of history to be a good estimate; pass the stream's known rate (`1000 /
   * hz`) for a track that may have only 2 points, such as a callback right after a gap.
   */
  intervalMs?: number;
}

export interface Playback<V extends readonly number[]> {
  /**
   * The value to draw at `nowMs`: the track `delayMs` earlier, interpolated, briefly predicted
   * past the newest sample, and eased toward without ever jumping. `frameMs` is the time since the
   * previous call, used for the catch-up and any running `snap`. `null` before the first sample.
   */
  at(track: SampleTrack<V>, nowMs: number, delayMs: number, frameMs: number): V | null;
  /** An event carried its own value (a shot): move the drawn value there over `overMs` (default 60). */
  snap(values: V, overMs?: number): void;
}

interface Snap<V extends readonly number[]> {
  from: V;
  to: V;
  durationMs: number;
  elapsedMs: number;
}

/** A stateful player for one stream. Create one per player per stream type. */
export function createPlayback<V extends readonly number[]>(
  options: PlaybackOptions = {},
): Playback<V> {
  const predictMs = options.predictMs ?? 100;
  const tauMs = options.tauMs ?? 60;
  const catchUpMs = options.catchUpMs ?? 50;
  const intervalMs = options.intervalMs;

  let shown: V | null = null;
  let snapping: Snap<V> | null = null;

  return {
    at(track, nowMs, delayMs, frameMs) {
      if (snapping !== null) {
        snapping.elapsedMs += Math.max(0, frameMs);
        const f =
          snapping.durationMs <= 0 ? 1 : Math.min(1, snapping.elapsedMs / snapping.durationMs);
        shown = lerp(snapping.from, snapping.to, f);
        if (f >= 1) snapping = null;
        return shown;
      }

      const targetValue = targetAt(track, nowMs - delayMs, predictMs, tauMs, intervalMs);
      if (targetValue === null) return shown;
      shown = shown === null ? targetValue : catchUp(shown, targetValue, frameMs, catchUpMs);
      return shown;
    },
    snap(values, overMs = 60) {
      snapping = {
        from: shown ?? values,
        to: values,
        durationMs: Math.max(0, overMs),
        elapsedMs: 0,
      };
      shown = snapping.from;
    },
  };
}

/** The track's value at game time `t`: interpolated, held across a gap, or predicted past the end. */
function targetAt<V extends readonly number[]>(
  track: SampleTrack<V>,
  t: number,
  predictMs: number,
  tauMs: number,
  intervalMs: number | undefined,
): V | null {
  const first = track[0];
  if (first === undefined) return null;
  if (t <= first[0]) return valuesOf(first);

  const last = track[track.length - 1]!;
  if (t >= last[0]) return predictPast(track, last, t - last[0], predictMs, tauMs);

  const nextIndex = track.findIndex((sample) => sample[0] > t);
  const after = track[nextIndex] ?? last;
  const before = track[nextIndex - 1] ?? first;
  const interval = intervalMs ?? typicalIntervalMs(track);
  const start = Math.max(before[0], after[0] - interval);
  if (t <= start) return valuesOf(before);
  const f = (t - start) / (after[0] - start);
  return lerp(valuesOf(before), valuesOf(after), f);
}

/**
 * Continues from the newest sample with the velocity of the last 3 samples, easing out over
 * `tauMs`, for at most `predictMs`. Clamped to −1 to 1, the range every Couchcade stream uses.
 * Held at the `predictMs` position once `dt` passes it.
 */
function predictPast<V extends readonly number[]>(
  track: SampleTrack<V>,
  last: Sample<V>,
  dt: number,
  predictMs: number,
  tauMs: number,
): V {
  const horizon = Math.min(dt, predictMs);
  const lastValues = valuesOf(last);
  if (horizon <= 0) return lastValues;

  const velocity = velocityOf(track);
  const decay = 1 - Math.exp(-horizon / tauMs);
  return lastValues.map((value, i) =>
    clampUnit(value + velocity[i]! * tauMs * decay),
  ) as unknown as V;
}

/** Velocity per component from the last up-to-3 samples, in units per ms. All 0 with under 2. */
function velocityOf<V extends readonly number[]>(track: SampleTrack<V>): number[] {
  const points = track.slice(-3);
  const from = points[0];
  const to = points[points.length - 1];
  if (from === undefined || to === undefined || to[0] === from[0]) {
    return (from ? valuesOf(from) : []).map(() => 0);
  }
  const dtMs = to[0] - from[0];
  return valuesOf(to).map((value, i) => (value - valuesOf(from)[i]!) / dtMs);
}

/**
 * The track's own typical sample spacing: the median gap between consecutive samples. A gap
 * longer than this is treated as the phone holding still, not fresh movement to interpolate over.
 * 0 with fewer than 2 samples, which makes every segment interpolate over its own full span.
 */
function typicalIntervalMs<V extends readonly number[]>(track: SampleTrack<V>): number {
  if (track.length < 2) return 0;
  const deltas: number[] = [];
  for (let i = 1; i < track.length; i++) deltas.push(track[i]![0] - track[i - 1]![0]);
  deltas.sort((a, b) => a - b);
  const mid = Math.floor(deltas.length / 2);
  return deltas.length % 2 === 1 ? deltas[mid]! : (deltas[mid - 1]! + deltas[mid]!) / 2;
}

function catchUp<V extends readonly number[]>(
  shown: V,
  target: V,
  frameMs: number,
  catchUpMs: number,
): V {
  const f = 1 - Math.exp(-Math.max(0, frameMs) / catchUpMs);
  return shown.map((value, i) => value + (target[i]! - value) * f) as unknown as V;
}

function lerp<V extends readonly number[]>(a: V, b: V, f: number): V {
  return a.map((value, i) => value + (b[i]! - value) * f) as unknown as V;
}

function valuesOf<V extends readonly number[]>(sample: Sample<V>): V {
  return sample.slice(1) as unknown as V;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(-1, value));
}
