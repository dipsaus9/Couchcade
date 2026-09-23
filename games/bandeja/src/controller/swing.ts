/**
 * The swing and its one message (docs/games/bandeja.md, "Phone controller" and "Fairness"). Plain
 * TypeScript without Vue, so it runs against the fake sensor adapter in tests, the same split
 * Strike Night's `bowl.ts` and Target Range's `aim.ts` use.
 *
 * - Motion: the adapter's samples go through one pose tracker into `createSwingDetector({ emitOn:
 *   "peak", minPeak: 320 })` (motion.md marks `minPeak` "game may tune"; 320 is above the 240
 *   default so a phone waved in conversation over a 3-minute match never reads as a swing). There is
 *   no grip button: `newPoint` marks `grip-down` when a point starts and `grip-up` when the previous
 *   one ends, so every swing in a point shares one heading reference and a player who turned to talk
 *   gets re-referenced at the next point (found while writing the spec, finding 3).
 * - Touch: `createSwingTap({ pad })` reads the big action itself as the pad, split left/right by
 *   whatever `pad()` returns, read fresh on every tap so a resized pad still splits in half.
 * - Both emit at most one `Swing` every 400 ms (the detector's and the tap's own cooldown), and
 *   this fires it as `swing`, with the point it's for, through the game's one `InputChannel`.
 *   `spin` and `peakAt` never leave the phone: v1 has no spin, and the input's own `at` (the second
 *   argument to `fire`) already carries the peak.
 */
import type { ControllerMotion, InputChannel } from "@couchcade/game-sdk/contract";
import { type Calibration, createPoseTracker } from "@couchcade/motion/calibration";
import {
  createSwingTap,
  type PadBounds,
  type PointerPoint,
  type SwingTap,
} from "@couchcade/motion/fallbacks";
import { createSwingDetector, type Swing, type SwingDetector } from "@couchcade/motion/gestures";
import type { MotionAdapter } from "@couchcade/motion/sensors";
import type { BandejaInput } from "../shared/input.ts";

/** The motion step's result, as the controller runtime passes it. */
export type BandejaMotion = ControllerMotion<MotionAdapter, Calibration>;

/** What the swing needs from the controller's one `InputChannel`. */
export type SwingChannel = Pick<InputChannel<BandejaInput>, "fire">;

/** Notified with no arguments every time a swing actually sends, for the phone's own local "swung"
 * flash (docs/games/bandeja.md, "Screens"). Separate from `SwingChannel.fire`, which only the game
 * hears. */
export type SwungListener = () => void;

export interface SwingController {
  /** Which controls are live. */
  mode(): "motion" | "touch";
  /** Follows the motion result. Undefined or `touch` uses the tap pad. */
  use(motion: BandejaMotion | undefined): void;
  /**
   * A point started: closes any grip left open from the previous point, then opens a fresh one,
   * re-referencing the motion detector's heading (docs/games/bandeja.md, "Motion controls"). Also
   * remembers `point`, echoed in every `swing` sent until the next call. A no-op on the pad in
   * touch mode, which needs no grip.
   */
  newPoint(point: number, t: number): void;
  /** The match ended, or the component is going away: closes any grip still open. */
  endMatch(t: number): void;
  /** A tap landed on the pad (touch mode only; ignored while in motion mode). */
  tap(point: PointerPoint): void;
  /** Called every time a swing actually sends. Returns a function that removes the listener. */
  on(listener: SwungListener): () => void;
  dispose(): void;
}

const noop = (): void => {};

export function createSwingController(
  channel: SwingChannel,
  pad: () => PadBounds,
): SwingController {
  let mode: "motion" | "touch" = "touch";
  let detector: SwingDetector | null = null;
  let tapSource: SwingTap | null = null;
  let current: BandejaMotion | undefined;
  let stopAdapter: () => void = noop;
  let gripped = false;
  let point = 1;
  const listeners = new Set<SwungListener>();

  const onSwing = (swing: Swing, t: number): void => {
    channel.fire({ type: "swing", payload: { point, speed: swing.speed, angle: swing.angle } }, t);
    for (const listener of listeners) listener();
  };

  const useTouch = (): void => {
    stopAdapter();
    stopAdapter = noop;
    current = undefined;
    mode = "touch";
    detector = null;
    gripped = false;
    const nextTap = createSwingTap({ pad });
    nextTap.on(onSwing);
    tapSource = nextTap;
  };

  const useMotion = (motion: Extract<BandejaMotion, { mode: "motion" }>): void => {
    stopAdapter();
    current = motion;
    mode = "motion";
    tapSource = null;
    gripped = false;
    const tracker = createPoseTracker(motion.calibration);
    const nextDetector = createSwingDetector({ emitOn: "peak", minPeak: 320 });
    nextDetector.on(onSwing);
    detector = nextDetector;
    stopAdapter = motion.adapter.start((sample) => nextDetector.push(tracker.push(sample)));
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
      useMotion(motion);
    },

    newPoint(nextPoint, t) {
      point = nextPoint;
      if (mode !== "motion" || detector === null) return;
      if (gripped) detector.mark({ type: "grip-up", t });
      detector.mark({ type: "grip-down", t });
      gripped = true;
    },

    endMatch(t) {
      if (mode === "motion" && detector !== null && gripped) {
        detector.mark({ type: "grip-up", t });
      }
      gripped = false;
    },

    tap(p) {
      if (mode === "touch") tapSource?.push(p);
    },

    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    dispose() {
      stopAdapter();
    },
  };
}
