/**
 * Aim, then power (docs/games/putt-club.md, "Aim, then power" and "Phone controller"). Plain
 * TypeScript without Vue, so it runs against the fake sensor adapter in tests, the same split
 * Strike Night's `bowl.ts`, Bandeja's `swing.ts` and Target Range's `aim.ts` use.
 *
 * Putt Club is the first Couchcade game to read two gestures in one turn (motion.md, "Each of our
 * games reads at most two gestures"): Aim (CC-5.5) sets the line, then holding the big action locks
 * it and Swing (CC-5.4) putts along it. The two steps cannot overlap -- swinging the phone is, to an
 * aim detector, an enormous yaw change -- so locking the line and stopping the aim stream happen in
 * the same instant (owner decision 1).
 *
 * - Motion: one pose tracker feeds both `createAimDetector({ yawRangeDeg: AIM_SPAN_DEG })`,
 *   streamed through `createAimSender` while the turn is open and the line is unlocked, and
 *   `createSwingDetector({ emitOn: "peak", minPeak: 120, fullPeak: 600, startRate: 70, endRate:
 *   40 })`, tuned down from the package's bowling-arm defaults (240/900/120/60) for a putter's
 *   gentle stroke (docs/games/putt-club.md, "Why minPeak and fullPeak come down"). `pointerdown` on
 *   the big action locks the line and marks `grip-down`, so the detector starts listening.
 * - Touch: `createAimDrag({ yawDragPx: 480 })` for the pad above the big action. The big action
 *   itself becomes the swipe pad, `createSwingSwipe({ emitOn: "peak" })`: touching it is the lock.
 * - Both paths recentre when a turn opens, not just motion (docs/games/putt-club.md, "Both paths
 *   recentre" -- finding 4: Target Range still doesn't).
 * - The locked line is the aim the TV was shown, not a fresh reading (CC-11.10): a short buffer of
 *   the yaw samples actually streamed is replayed through `createPlayback`, `shownDelayMs` behind,
 *   the same technique `target-range/src/controller/aim.ts` uses for `shoot`.
 */
import type { ControllerMotion, InputChannel } from "@couchcade/game-sdk/contract";
import type { SampleTrack } from "@couchcade/game-sdk/input";
import { addSample, createPlayback } from "@couchcade/game-sdk/input";
import { type Calibration, createPoseTracker } from "@couchcade/motion/calibration";
import {
  type AimDrag,
  createAimDrag,
  createSwingSwipe,
  type PointerPoint,
  type SwingSwipe,
} from "@couchcade/motion/fallbacks";
import {
  type AimSource,
  createAimDetector,
  createAimSender,
  createSwingDetector,
  type Swing,
  type SwingDetector,
} from "@couchcade/motion/gestures";
import type { MotionAdapter } from "@couchcade/motion/sensors";
import { AIM_SPAN_DEG } from "../shared/constants.ts";
import type { PuttClubInput } from "../shared/input.ts";

/** The motion step's result, as the controller runtime passes it. */
export type PuttClubMotion = ControllerMotion<MotionAdapter, Calibration>;

/** What this needs from the controller's one `InputChannel`. `path` is optional so a minimal
 * fallback channel (a no-op stub, a test double) doesn't have to supply it: `shownDelayMs` treats
 * a missing `path` the same as `"relay"`, the larger (safer) of the two known delays. */
export type PuttChannel = Pick<
  InputChannel<PuttClubInput>,
  "stream" | "fire" | "clear" | "last"
> & {
  path?: InputChannel<PuttClubInput>["path"];
};

/** `../controller/index.ts`'s declared `streams.aim.hz`. */
const AIM_STREAM_HZ = 30;

/** CSS px of horizontal drag across the whole ±75° aim range (docs/games/putt-club.md, "Touch
 * controls"): deliberately slower than motion.md's 200 px default, because 200 px across 150° would
 * be 0.75° a pixel and a 2 m putt's whole tolerance would be under three pixels. */
const YAW_DRAG_PX = 480;

/** `createSwingDetector` tuned down from a bowler's arm to a putter's gentle stroke
 * (docs/games/putt-club.md, "Why minPeak and fullPeak come down"). */
const SWING_MIN_PEAK = 120;
const SWING_FULL_PEAK = 600;
const SWING_START_RATE = 70;
const SWING_END_RATE = 40;

/**
 * How far behind the TV plays this player's line right now (CC-11.10), mirroring
 * `apps/host/src/runtime/links.ts`'s `relayPlaybackDelayMs` (180, also used off the link, and when
 * `path` is unknown) and `directPlaybackDelayMs` (`1000 / hz` clamped to 25-120, jitter assumed 0
 * until it's measured -- same assumption the host makes).
 */
export function shownDelayMs(path: PuttChannel["path"]): number {
  if (path === "direct") return Math.min(120, Math.max(25, 1000 / AIM_STREAM_HZ));
  return 180;
}

/**
 * The phone's own part of a turn, local and immediate (docs/games/putt-club.md, "Screens"):
 * `aiming` -- unlocked, streaming aim. `locked` -- waiting for the swing. `unlockedEarly` -- let go
 * without swinging, a transient hint before aiming resumes. `away` -- the putt sent, the big action
 * is off until the next turn.
 */
export type PuttPhase = "aiming" | "locked" | "unlockedEarly" | "away";

export type PuttListener = (phase: PuttPhase) => void;

export interface PuttController {
  /** Which controls are live. */
  mode(): "motion" | "touch";
  /** Follows the motion result. Undefined or `touch` uses the drag pad and the swipe pad. */
  use(motion: PuttClubMotion | undefined): void;
  /**
   * A turn opened for this player: recentres aim on whichever source is live -- both paths
   * (docs/games/putt-club.md, "Both paths recentre") -- and streams the centred aim at once, so the
   * TV's line starts on the flag.
   */
  turnOpened(turn: number, t: number): void;
  /**
   * The turn closed without this phone sending anything of its own (the host moved on, or this
   * player isn't the putter): stops streaming without a message, and drops any stray grip.
   */
  close(): void;
  /**
   * `pointerdown` on the big action (motion), or on the swipe pad (touch): locks the line with the
   * aim the TV was shown and starts listening for the swing. `point` carries the touch coordinates
   * the swipe pad seeds with; motion mode ignores them.
   */
  lock(point: PointerPoint): void;
  /**
   * `pointerup` with no swing yet: unlocks the line so the player can aim again. A no-op once the
   * putt already sent (a swing can end, and fire, at `pointerup` itself: `emitOn: "peak"` still
   * emits a swing ending at grip-up) or the line isn't locked.
   */
  unlock(point: PointerPoint): void;
  /** `pointercancel`: the same as `unlock`, and also resets the swing source. */
  cancel(point: PointerPoint): void;
  /** Touch only, once locked: feeds the swipe pad. Ignored in motion mode or before `lock`. */
  swipe(point: PointerPoint): void;
  /** Touch only: feeds the aim drag pad. Ignored in motion mode. */
  pad(point: PointerPoint): void;
  /** Touch only: the Centre button. Forces the recentred aim out at once, because `lock` replays
   * only what was actually streamed (CC-11.10) -- unlike Target Range, whose `shoot` falls back to
   * a fresh live read, Putt Club's `lock` would otherwise miss a Centre press the player never
   * followed with a drag. */
  centre(t: number): void;
  /** Called with the phase every time it changes locally. A swing/swipe firing is the one change
   * not first caused by one of this controller's own calls. Returns an unsubscribe function. */
  on(listener: PuttListener): () => void;
  dispose(): void;
}

const noop = (): void => {};

/** Rounds to 3 decimals, without `-0`, matching `createAimSender`'s streamed precision. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000 + 0;
}

/** What `lock`/`turnOpened` need from either aim source. */
type Source = Pick<AimSource<unknown>, "aim" | "recentre" | "on">;

export function createPuttController(channel: PuttChannel): PuttController {
  /** The "aim" yaw samples actually streamed this turn, oldest first: what `lock` replays
   * (CC-11.10). Pitch is dropped -- the green is flat and the rules ignore it. */
  let streamed: SampleTrack<[number]> = [];
  const tracked: Pick<InputChannel<PuttClubInput>, "stream"> = {
    stream(input, t) {
      if (input.type === "aim" && t !== undefined) {
        streamed = addSample(streamed, t, [input.payload.yaw]);
      }
      channel.stream(input, t);
    },
  };
  const sender = createAimSender<PuttClubInput>(tracked);

  let mode: "motion" | "touch" = "touch";
  let current: PuttClubMotion | undefined;
  let aimSource: Source | null = null;
  let drag: AimDrag | null = null;
  let swingDetector: SwingDetector | null = null;
  let swipeSource: SwingSwipe | null = null;
  let stopSource: () => void = noop;

  let turn = 1;
  /** True only while this player's turn is actually open (between `turnOpened` and `close`, `lock`
   * firing a putt, or the next `turnOpened`). Guards every input against a stray late event. */
  let open = false;
  let locked = false;
  let putted = false;
  let lockedYaw = 0;

  const listeners = new Set<PuttListener>();
  const notify = (phase: PuttPhase): void => {
    for (const listener of listeners) listener(phase);
  };

  const onSwing = (swing: Swing, t: number): void => {
    if (!open || putted) return;
    putted = true;
    locked = false;
    channel.fire(
      { type: "putt", payload: { turn, yaw: lockedYaw, speed: swing.speed, angle: swing.angle } },
      t,
    );
    notify("away");
  };

  const listenAim = (source: Source): (() => void) => {
    aimSource = source;
    return source.on((reading) => {
      if (open && !locked) sender.update(reading);
    });
  };

  const useTouch = (): void => {
    stopSource();
    current = undefined;
    mode = "touch";
    swingDetector = null;
    const nextDrag = createAimDrag({ yawDragPx: YAW_DRAG_PX });
    const offAim = listenAim(nextDrag);
    drag = nextDrag;
    const nextSwipe = createSwingSwipe({ emitOn: "peak" });
    nextSwipe.on(onSwing);
    swipeSource = nextSwipe;
    stopSource = offAim;
  };

  const useMotion = (motion: Extract<PuttClubMotion, { mode: "motion" }>): void => {
    stopSource();
    current = motion;
    mode = "motion";
    drag = null;
    swipeSource = null;
    // One pose tracker feeds both detectors: this is the whole point of the first game reading two
    // gestures in a turn (motion.md, "Each of our games reads at most two gestures").
    const tracker = createPoseTracker(motion.calibration);
    const detector = createAimDetector({ yawRangeDeg: AIM_SPAN_DEG });
    const offAim = listenAim(detector);
    const swing = createSwingDetector({
      emitOn: "peak",
      minPeak: SWING_MIN_PEAK,
      fullPeak: SWING_FULL_PEAK,
      startRate: SWING_START_RATE,
      endRate: SWING_END_RATE,
    });
    swing.on(onSwing);
    swingDetector = swing;
    const stopAdapter = motion.adapter.start((sample) => {
      const reading = tracker.push(sample);
      detector.push(reading);
      swing.push(reading);
    });
    stopSource = () => {
      offAim();
      stopAdapter();
    };
  };

  useTouch();

  const sendCurrent = (t: number): void => {
    sender.reset();
    const aim = aimSource?.aim() ?? { yaw: 0, pitch: 0 };
    sender.update({ t, yaw: aim.yaw, pitch: aim.pitch });
  };

  const resetGrip = (): void => {
    if (mode === "motion") swingDetector?.reset();
    else swipeSource?.reset();
  };

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

    turnOpened(nextTurn, t) {
      turn = nextTurn;
      open = true;
      locked = false;
      putted = false;
      streamed = [];
      resetGrip();
      aimSource?.recentre(t);
      sendCurrent(t);
    },

    close() {
      if (!open) return;
      open = false;
      locked = false;
      sender.reset();
      channel.clear();
      streamed = [];
      resetGrip();
    },

    lock(point) {
      if (!open || locked || putted) return;
      locked = true;
      const delayMs = shownDelayMs(channel.path);
      const played = createPlayback<[number]>().at(streamed, point.t, delayMs, 0);
      lockedYaw =
        played !== null
          ? round3(played[0])
          : (channel.last("aim")?.payload.yaw ?? aimSource?.aim().yaw ?? 0);
      channel.stream({ type: "line", payload: { turn, locked: true, yaw: lockedYaw } }, point.t);
      if (mode === "motion") {
        swingDetector?.mark({ type: "grip-down", t: point.t });
      } else {
        swipeSource?.push({ ...point, type: "down" });
      }
      notify("locked");
    },

    unlock(point) {
      if (!open || !locked || putted) return;
      // The swing can still end (and fire) right at grip-up in "peak" mode, so check `putted`
      // again after marking it: a putt that fires here must not also be followed by an "unlocked"
      // message for the same instant.
      if (mode === "motion") {
        swingDetector?.mark({ type: "grip-up", t: point.t });
      } else {
        swipeSource?.push({ ...point, type: "up" });
      }
      if (putted) return;
      locked = false;
      channel.stream({ type: "line", payload: { turn, locked: false, yaw: lockedYaw } }, point.t);
      notify("unlockedEarly");
    },

    cancel(point) {
      const wasLocked = open && locked && !putted;
      resetGrip();
      if (wasLocked) {
        locked = false;
        channel.stream({ type: "line", payload: { turn, locked: false, yaw: lockedYaw } }, point.t);
        notify("unlockedEarly");
      }
    },

    swipe(point) {
      if (mode !== "touch" || !open || !locked || putted) return;
      swipeSource?.push(point);
    },

    pad(point) {
      if (mode !== "touch") return;
      drag?.push(point);
    },

    centre(t) {
      if (mode !== "touch") return;
      drag?.recentre(t);
      sendCurrent(t);
    },

    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    dispose() {
      stopSource();
      sender.dispose();
    },
  };
}
