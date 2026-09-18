/**
 * The swing and its messages (docs/games/strike-night.md, "Motion controls" and "Touch
 * controls"). Plain TypeScript without Vue, so it runs against the fake sensor adapter in tests,
 * the same split Target Range's `aim.ts` uses.
 *
 * - Motion: the adapter's samples go through one pose tracker into `createSwingDetector({
 *   emitOn: "release" })`, gripped by `mark({ type: "grip-down"/"grip-up" })` at the pointer's own
 *   edges.
 * - Touch: `createSwingSwipe({ emitOn: "release" })` reads the same pointer points; touching the
 *   pad is the grip, lifting is the release.
 * - Both emit one `Swing` per grip at most, and this fires it as `bowl` with the position the bar
 *   held at grip-down, through the game's one `InputChannel`. `move` and `grip` stream through the
 *   same channel, so the TV Pip follows the bowler's hand between messages.
 */
import type { ControllerMotion, InputChannel } from "@couchcade/game-sdk/contract";
import { type Calibration, createPoseTracker } from "@couchcade/motion/calibration";
import { createSwingSwipe, type PointerPoint, type SwingSwipe } from "@couchcade/motion/fallbacks";
import { createSwingDetector, type Swing, type SwingDetector } from "@couchcade/motion/gestures";
import type { MotionAdapter } from "@couchcade/motion/sensors";
import type { StrikeNightInput } from "../shared/input.ts";

/** The motion step's result, as the controller runtime passes it. */
export type StrikeNightMotion = ControllerMotion<MotionAdapter, Calibration>;

/** What the swing needs from the controller's one `InputChannel`. */
export type BowlChannel = Pick<InputChannel<StrikeNightInput>, "stream" | "fire">;

export interface Bowl {
  /** Which controls are live. */
  mode(): "motion" | "touch";
  /** Follows the motion result. Undefined or `touch` uses the swipe pad. */
  use(motion: StrikeNightMotion | undefined): void;
  /** A new lineup opened for this bowler: forgets any grip or swing in progress. Listeners stay. */
  reset(): void;
  /**
   * A finger landed on the big action (or the swipe pad): the grip. `turn` and `standX` (the move
   * bar's position) travel with the eventual `bowl`.
   */
  gripDown(turn: number, standX: number, point: PointerPoint): void;
  /** Pointer feed while gripping. Ignored in motion mode; the swipe pad reads it in touch mode. */
  gripMove(point: PointerPoint): void;
  /**
   * The finger lifted: the release. Fires `bowl` through the channel if a swing qualified, and
   * returns whether it did — the caller shows "no swing" otherwise, and sends `grip` with
   * `held: false` either way that a bowl didn't already clear it.
   */
  gripUp(point: PointerPoint): boolean;
  /** The pointer was cancelled: abandons the grip. Nothing is bowled. */
  gripCancel(turn: number, t: number): void;
  dispose(): void;
}

const noop = (): void => {};

export function createBowl(channel: BowlChannel): Bowl {
  let mode: "motion" | "touch" = "touch";
  let detector: SwingDetector | null = null;
  let swipe: SwingSwipe | null = null;
  let current: StrikeNightMotion | undefined;
  let stopAdapter: () => void = noop;
  let fired = false;
  let turn = 0;
  let standX = 0;

  const onSwing = (swing: Swing, t: number): void => {
    fired = true;
    channel.fire(
      {
        type: "bowl",
        payload: { turn, x: standX, speed: swing.speed, angle: swing.angle, spin: swing.spin },
      },
      t,
    );
  };

  const useTouch = (): void => {
    stopAdapter();
    stopAdapter = noop;
    current = undefined;
    mode = "touch";
    detector = null;
    swipe = createSwingSwipe({ emitOn: "release" });
    swipe.on(onSwing);
  };

  const useMotion = (motion: Extract<StrikeNightMotion, { mode: "motion" }>): void => {
    stopAdapter();
    current = motion;
    mode = "motion";
    swipe = null;
    const tracker = createPoseTracker(motion.calibration);
    const nextDetector = createSwingDetector({ emitOn: "release" });
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

    reset() {
      fired = false;
      detector?.reset();
      swipe?.reset();
    },

    gripDown(turnArg, standXArg, point) {
      turn = turnArg;
      standX = standXArg;
      fired = false;
      channel.stream({ type: "grip", payload: { turn, held: true } }, point.t);
      if (mode === "motion") detector?.mark({ type: "grip-down", t: point.t });
      else swipe?.push(point);
    },

    gripMove(point) {
      if (mode === "touch") swipe?.push(point);
    },

    gripUp(point) {
      if (mode === "motion") detector?.mark({ type: "grip-up", t: point.t });
      else swipe?.push(point);
      if (!fired) channel.stream({ type: "grip", payload: { turn, held: false } }, point.t);
      return fired;
    },

    gripCancel(turnArg, t) {
      fired = false;
      detector?.reset();
      swipe?.reset();
      channel.stream({ type: "grip", payload: { turn: turnArg, held: false } }, t);
    },

    dispose() {
      stopAdapter();
    },
  };
}
