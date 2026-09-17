/**
 * Aim and the shot's messages (docs/games/target-range.md, "Motion controls" and "Touch controls").
 * Plain TypeScript without Vue, so it runs against the fake sensor adapter in tests.
 *
 * - Motion: the adapter's samples go through one pose tracker into `createAimDetector`. A draw
 *   recentres it, so the crosshair starts at its home.
 * - Touch: `createAimDrag` on the pad, with a Centre button. A draw doesn't recentre it.
 * - Both stream through one `createAimSender` into the game's one CC-3.6 input stream, only while
 *   a draw is held or, in touch mode, the pad is dragged. `shoot` and `lower` go with `fire`, and
 *   `shoot` carries the aim at the moment of release.
 */
import type { ControllerMotion } from "@couchcade/game-sdk/contract";
import type { Aim, InputStream } from "@couchcade/game-sdk/input";
import { type Calibration, createPoseTracker } from "@couchcade/motion/calibration";
import { type AimDrag, createAimDrag, type PointerPoint } from "@couchcade/motion/fallbacks";
import {
  type AimSenderOptions,
  type AimSource,
  createAimDetector,
  createAimSender,
} from "@couchcade/motion/gestures";
import type { MotionAdapter } from "@couchcade/motion/sensors";
import type { TargetRangeInput } from "../shared/input.ts";

/** The motion step's result, as the controller runtime passes it. */
export type TargetRangeMotion = ControllerMotion<MotionAdapter, Calibration>;

export type ShotStream = Pick<InputStream<TargetRangeInput>, "set" | "fire" | "clear">;

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
  /** Let go at enough power: sends `shoot` with the aim right now. */
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

/** What the shot needs from either aim source. */
type Source = Pick<AimSource<unknown>, "aim" | "recentre" | "on">;

export function createShotAim(stream: ShotStream, options: AimSenderOptions = {}): ShotAim {
  // The sender only sends `aim`. Naming the type here keeps the stream typed to this game's inputs.
  const sender = createAimSender(
    { set: (input, t) => stream.set({ type: "aim", payload: input.payload }, t) },
    options,
  );

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
    drag = createAimDrag();
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
    stream.clear();
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
      const detector = createAimDetector();
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
      const released = aim();
      settle();
      stream.fire({ type: "shoot", payload: { volley, aim: released, power } }, t);
    },

    lower(volley, t) {
      settle();
      stream.fire({ type: "lower", payload: { volley } }, t);
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
