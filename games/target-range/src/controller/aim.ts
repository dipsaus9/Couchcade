/**
 * Aim and the shot's messages (docs/games/target-range.md, "Motion controls" and "Touch controls").
 * Plain TypeScript without Vue, so it runs against the fake sensor adapter in tests.
 *
 * - Motion: the adapter's samples go through one pose tracker into `createAimDetector`, tuned to
 *   `aimPxPerDegree` (CC-11.9, docs/architecture/realtime-link.md, "Tuning Target Range's aim
 *   speed"). A draw recentres it, so the crosshair starts at its home.
 * - Touch: `createAimDrag` on the pad, tuned to `padPxPerCssPx`, with a Centre button. A draw
 *   doesn't recentre it.
 * - Both stream through one `createAimSender` into the game's one `InputChannel`, only while a
 *   draw is held or, in touch mode, the pad is dragged. `shoot` and `lower` go with
 *   `channel.fire`.
 * - `shoot` carries the aim the TV was shown, not the phone's freshest live sample (CC-11.10;
 *   realtime-link.md, "The phone decides its own shot", rule 2). The phone has no way to learn the
 *   TV's exact `playbackDelayMs` or its interpolated position (that's per-connection, host-only
 *   tuning: `apps/host/src/runtime/links.ts`), so instead it keeps its own short buffer of the
 *   samples it actually streamed and, at release, replays that buffer through the same
 *   `createPlayback` the TV's crosshair uses (`../host/aim-playback.ts`'s `createCrosshairPlayback`),
 *   `AIM_PLAYBACK_DELAY_MS` behind. Both sides run the identical, deterministic algorithm over the
 *   same samples, so they land on the same "shown" aim without a new message.
 */
import type { ControllerMotion, InputChannel } from "@couchcade/game-sdk/contract";
import type { Aim, SampleTrack } from "@couchcade/game-sdk/input";
import { AIM_PLAYBACK_DELAY_MS, addSample, createPlayback } from "@couchcade/game-sdk/input";
import { type Calibration, createPoseTracker } from "@couchcade/motion/calibration";
import { type AimDrag, createAimDrag, type PointerPoint } from "@couchcade/motion/fallbacks";
import {
  type AimSenderOptions,
  type AimSource,
  createAimDetector,
  createAimSender,
} from "@couchcade/motion/gestures";
import type { MotionAdapter } from "@couchcade/motion/sensors";
import { aimPxPerDegree, padPxPerCssPx, pitchPx, yawPx } from "../shared/constants.ts";
import type { TargetRangeInput } from "../shared/input.ts";

/** The motion step's result, as the controller runtime passes it. */
export type TargetRangeMotion = ControllerMotion<MotionAdapter, Calibration>;

/** What the shot needs from the controller's one `InputChannel`. */
export type ShotChannel = Pick<
  InputChannel<TargetRangeInput>,
  "stream" | "fire" | "clear" | "last"
>;

export interface ShotAim {
  /** Which controls are live. */
  mode(): "motion" | "touch";
  /**
   * Follows the motion result. Undefined or `touch` uses the drag pad. The same result again keeps
   * the current aim.
   */
  use(motion: TargetRangeMotion | undefined): void;
  /** A volley opened: forget stale samples. Touch sends its current aim, so the crosshair shows. */
  volleyOpened(t: number): void;
  /** A finger landed on the big action. */
  startDraw(t: number): void;
  /** Let go at enough power: sends `shoot` with the aim the TV was shown. */
  shoot(volley: number, power: number, t: number): void;
  /** Let go too early, or cancelled: sends `lower`, so the TV hides the crosshair. */
  lower(volley: number, t: number): void;
  /** The volley closed mid-draw. Stops streaming without a message. */
  stop(): void;
  /** Pointer events on the touch pad. Ignored in motion mode. */
  pad(point: PointerPoint): void;
  /** The Centre button. Ignored in motion mode. */
  centre(t: number): void;
  aim(): Aim;
  dispose(): void;
}

const noop = (): void => {};

/** Rounds to 3 decimals, without `-0`, matching `createAimSender`'s streamed precision. */
const round3 = (value: number): number => Math.round(value * 1000) / 1000 + 0;

/** What the shot needs from either aim source. */
type Source = Pick<AimSource<unknown>, "aim" | "recentre" | "on">;

/** Degrees that map to a full ±1 aim, derived from `yawPx`/`pitchPx` and `aimPxPerDegree` so yaw
 * and pitch move at the same world-px-per-degree speed (33.3° and 15°). */
const yawRangeDeg = yawPx / aimPxPerDegree;
const pitchRangeDeg = pitchPx / aimPxPerDegree;

/** CSS px of drag across the pad's whole yaw/pitch range, derived from `padPxPerCssPx` (267 and 120). */
const yawDragPx = (2 * yawPx) / padPxPerCssPx;
const pitchDragPx = (2 * pitchPx) / padPxPerCssPx;

export function createShotAim(channel: ShotChannel, options: AimSenderOptions = {}): ShotAim {
  /** The "aim" samples that actually reached `channel.stream` this draw, oldest first: what
   * `shoot` replays (CC-11.10). Only samples `createAimSender` keeps (it skips one that barely
   * moved) land here, so this is exactly what the TV received, not every raw sensor reading. */
  let streamed: SampleTrack<[number, number]> = [];
  const tracked: Pick<InputChannel<TargetRangeInput>, "stream"> = {
    stream(input, t) {
      if (input.type === "aim" && t !== undefined) {
        streamed = addSample(streamed, t, [input.payload.yaw, input.payload.pitch]);
      }
      channel.stream(input, t);
    },
  };
  const sender = createAimSender<TargetRangeInput>(tracked, options);

  let mode: "motion" | "touch" = "touch";
  /** The drag pad, only in touch mode. */
  let drag: AimDrag | null = null;
  let source: Source | null = null;
  let current: TargetRangeMotion | undefined;
  let stopSource: () => void = noop;
  let drawing = false;
  let padHeld = false;

  /** Makes `next` the aim. `stopExtra` runs when it's replaced, such as the adapter listener. */
  const listen = (next: Source, stopExtra: () => void = noop): void => {
    stopSource();
    source = next;
    const off = next.on((reading) => {
      if (drawing || padHeld) sender.update(reading);
    });
    stopSource = () => {
      off();
      stopExtra();
    };
  };

  const useTouch = (): void => {
    current = undefined;
    mode = "touch";
    padHeld = false;
    drag = createAimDrag({ yawDragPx, pitchDragPx });
    listen(drag);
  };

  const aim = (): Aim => source?.aim() ?? { yaw: 0, pitch: 0 };

  const sendCurrent = (t: number): void => {
    sender.reset();
    sender.update({ t, ...aim() });
  };

  /** Ends streaming and drops anything not sent yet, so no stale aim follows. */
  const settle = (): void => {
    drawing = false;
    padHeld = false;
    sender.reset();
    channel.clear();
    streamed = [];
  };

  useTouch();

  return {
    mode: () => mode,

    use(motion) {
      if (motion?.mode !== "motion") {
        if (mode !== "touch") useTouch();
        return;
      }
      if (
        current?.mode === "motion" &&
        current.adapter === motion.adapter &&
        current.calibration === motion.calibration
      ) {
        return;
      }
      current = motion;
      mode = "motion";
      drag = null;
      const tracker = createPoseTracker(motion.calibration);
      const detector = createAimDetector({ yawRangeDeg, pitchRangeDeg });
      let stopAdapter: () => void = noop;
      listen(detector, () => stopAdapter());
      stopAdapter = motion.adapter.start((sample) => detector.push(tracker.push(sample)));
    },

    volleyOpened(t) {
      settle();
      if (mode === "touch") sendCurrent(t);
    },

    startDraw(t) {
      if (mode === "motion") source?.recentre(t);
      drawing = true;
      sendCurrent(t);
    },

    shoot(volley, power, t) {
      // The aim the TV was shown, not a fresh sensor reading at release (realtime-link.md, "The
      // phone decides its own shot", rule 2; CC-11.10): replay `streamed` the same
      // `AIM_PLAYBACK_DELAY_MS` behind, with the same generic `createPlayback` the TV's crosshair
      // uses, so both sides land on the same value without a new message. `startDraw` (or `pad`'s
      // `down`) always forces a sample through first, so `streamed` is never empty here; the
      // `channel.last`/`aim()` fallbacks only guard a track `addSample` happened to reject
      // (non-finite time or value, which never occurs in practice).
      const played = createPlayback<[number, number]>().at(streamed, t, AIM_PLAYBACK_DELAY_MS, 0);
      const released =
        played === null
          ? (channel.last("aim")?.payload ?? aim())
          : { yaw: round3(played[0]), pitch: round3(played[1]) };
      settle();
      channel.fire({ type: "shoot", payload: { volley, aim: released, power } }, t);
    },

    lower(volley, t) {
      settle();
      channel.fire({ type: "lower", payload: { volley } }, t);
    },

    stop: settle,

    pad(point) {
      if (drag === null) return;
      if (point.type === "down") {
        drag.push(point);
        padHeld = true;
        if (!drawing) sendCurrent(point.t);
        return;
      }
      drag.push(point);
      if (point.type !== "move") padHeld = false;
    },

    centre(t) {
      drag?.recentre(t);
    },

    aim,

    dispose() {
      stopSource();
      sender.dispose();
    },
  };
}
