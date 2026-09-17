/**
 * Aim playback on the TV, from docs/architecture/motion.md, "Aim (CC-5.5)" and owner decision 2.
 *
 * The phone samples aim 15 times a second and packs the latest samples into one `set` input, at
 * most 4 per message: `aim: [[dtMs, yaw, pitch], ...]`, newest last, where `dtMs` is each sample's
 * offset from the input's `at`. At 4 messages a second the crosshair would jump, so the host plays
 * the samples back 250 ms behind and moves smoothly between them.
 *
 * Host code may not import `@couchcade/motion`, so this lives here. Both functions are pure and the
 * track is plain JSON, so a game keeps it in `TState`:
 *
 * ```ts
 * onPlayerInput(state, player, input, ctx) {
 *   const aim = addAimSamples(state.aim[player.id] ?? [], ctx.atMs, input.payload.aim);
 *   return { ...state, aim: { ...state.aim, [player.id]: aim } };
 * }
 * // Each frame: const crosshair = aimAt(state.aim[player.id] ?? [], nowMs);
 * ```
 *
 * Shots never use this. A fire input carries the aim the phone had at that moment (motion.md,
 * "Fitting the input budget", rule 3), so the trailing crosshair never changes a hit.
 *
 * `aimAt` is a thin wrapper over the generic `createPlayback` (`playback.ts`): a fresh, stateless
 * player per call, with prediction off, so it keeps today's exact behaviour (interpolate, hold
 * across a gap, no lag) until Target Range moves to the input channel and `createPlayback`
 * directly (CC-11.9).
 */
import { createPlayback } from "./playback.ts";
import type { SampleTrack } from "./playback.ts";

/** One packed sample as the phone sends it: offset from the input's `at`, yaw and pitch (−1 to 1). */
export type AimSample = readonly [dtMs: number, yaw: number, pitch: number];

/** One point of the host's aim track: game time, yaw and pitch. */
export type AimPoint = readonly [atMs: number, yaw: number, pitch: number];

/** The received aim of one player, oldest first. Plain JSON, safe in `TState`. */
export type AimTrack = readonly AimPoint[];

export interface Aim {
  yaw: number;
  pitch: number;
}

/** How far the TV plays aim behind the game clock. */
export const AIM_PLAYBACK_DELAY_MS = 250;
/** How often the phone samples aim. */
export const AIM_SAMPLES_PER_SECOND = 15;
/** Most samples packed into one input message. */
export const AIM_SAMPLES_PER_MESSAGE = 4;
/** Points a track keeps, about a second of aim. */
export const AIM_TRACK_MAX_POINTS = 16;

const sampleIntervalMs = 1000 / AIM_SAMPLES_PER_SECOND;

/**
 * Returns a new track with one message's samples added. `atMs` is the input's time in game time,
 * `InputContext.atMs`. Only the newest `AIM_SAMPLES_PER_MESSAGE` samples count, values are clamped
 * to −1 to 1, samples with non-finite numbers are skipped, and a sample at a time the track already
 * has replaces that point. The track keeps its newest `maxPoints` points.
 */
export function addAimSamples(
  track: AimTrack,
  atMs: number,
  samples: readonly AimSample[],
  maxPoints: number = AIM_TRACK_MAX_POINTS,
): AimTrack {
  const added: AimPoint[] = [];
  for (const [dtMs, yaw, pitch] of samples.slice(-AIM_SAMPLES_PER_MESSAGE)) {
    const at = atMs + dtMs;
    if (!Number.isFinite(at) || !Number.isFinite(yaw) || !Number.isFinite(pitch)) continue;
    added.push([at, clampAimUnit(yaw), clampAimUnit(pitch)]);
  }
  if (added.length === 0) return track;
  const times = new Set(added.map(([at]) => at));
  return [...track.filter(([at]) => !times.has(at)), ...added]
    .toSorted((a, b) => a[0] - b[0])
    .slice(-maxPoints);
}

/**
 * The aim to show at game time `nowMs`: the track as it was `delayMs` earlier. Between two samples
 * it moves in a straight line. After a gap longer than one sample interval (the phone skips samples
 * while it is held still) it holds the older sample until one interval before the newer one, so
 * the crosshair doesn't creep while the hand was still. Before the first point it shows the first,
 * after the last it holds the last. `null` for an empty track.
 */
export function aimAt(
  track: AimTrack,
  nowMs: number,
  delayMs: number = AIM_PLAYBACK_DELAY_MS,
): Aim | null {
  if (track.length === 0) return null;
  // Prediction off, the fixed 15 Hz interval (not inferred, so a 2-point track still holds
  // correctly), and a fresh player every call: the target is drawn with no lag, exactly as today.
  // `frameMs` never matters here since a stateless player has no catch-up to ease.
  const value = createPlayback<[number, number]>({ predictMs: 0, intervalMs: sampleIntervalMs }).at(
    track as unknown as SampleTrack<[number, number]>,
    nowMs,
    delayMs,
    0,
  );
  return value === null ? null : { yaw: value[0], pitch: value[1] };
}

function clampAimUnit(value: number): number {
  return Math.min(1, Math.max(-1, value));
}
