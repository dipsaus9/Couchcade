import { createRestCalibration, type Calibration } from "@couchcade/motion/calibration";
import { waitForCapability } from "@couchcade/motion/sensors";
import type {
  MotionAdapter,
  MotionCapability,
  MotionListener,
  MotionPermission,
} from "@couchcade/motion/sensors";
import type { PhoneToRelayMessage } from "@couchcade/protocol";
import { shallowRef, type ShallowRef } from "vue";
import type { PhoneState } from "../session/state.ts";
import { parseMotionPermissionView } from "./view.ts";

// The phone side of the motion step (docs/architecture/motion.md, "Permission, calibration and
// resume flow"). Before a game with `needsMotion` the host sends every seated phone the
// `motion-permission` view. The phone then:
//
// 1. asks: "Tap to enable motion" calls the adapter's `request()` synchronously inside the tap,
//    renews the screen wake lock and, on Android, enters fullscreen with portrait locked.
//    "Use touch instead" answers `denied` without asking the browser.
// 2. after `granted`, waits up to 1 s for real sensor data, then runs the one second of holding
//    still (rest calibration, CC-5.3) with a progress ring.
// 3. sends one `motion:status`: `granted` once calibrated, `denied` when the player or the browser
//    said no, `unsupported` for no sensors, no gyroscope, or sensors that stopped.
// 4. during the game: when the page comes back from hidden, "Tap to resume" asks again and
//    restarts the sensors, keeping the calibration (rule 6). When no sample arrives for 2 s while
//    the page is visible, the player switches to touch for the rest of the game (rule 7).

/** Where the phone is in the motion step. */
export type MotionFlow =
  /** "Tap to enable motion" or "Use touch instead". */
  | { kind: "ask" }
  /** The browser was asked. Waiting for its answer and the first real sensor data. */
  | { kind: "starting" }
  /** "Hold your phone still". `progress` runs from 0 to 1. */
  | { kind: "still"; progress: number }
  /** Motion is on and calibrated. */
  | { kind: "ready" }
  /** "Touch controls it is". `acknowledged` once the player tapped "Ready". */
  | { kind: "touch"; reason: "denied" | "unsupported"; acknowledged: boolean };

/** One motion game on this phone, from the motion step until the game ends. */
export interface MotionGame {
  step: number;
  gameId: string;
  title: string;
  flow: MotionFlow;
  /** The rest calibration while motion is on, kept through a sleep. Null otherwise. */
  calibration: Calibration | null;
  /** What the sensors delivered, `none` before the check. */
  capability: MotionCapability;
  /** True once the game itself runs on the phone. */
  playing: boolean;
  /** True from the page coming back from hidden with motion on, until "Tap to resume". */
  paused: boolean;
}

/** How long the phone may go without a sample during the game before it switches to touch. */
export const motionStallMs = 2000;
/** How often the stall check runs. */
export const motionStallCheckMs = 500;
/**
 * Rest calibration gives up after 5 s of samples by itself. When samples stop coming altogether,
 * this wall-clock limit ends the step with touch instead.
 */
export const stillGiveUpMs = 8000;
/** The still second, in ms, for the progress ring. */
const stillMs = 1000;

export type Schedule = (callback: () => void, delayMs: number) => () => void;

/** The page's `document`, as far as the session uses it. */
export interface MotionDocument {
  readonly visibilityState: string;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export interface MotionSessionOptions {
  /** The sensor adapter, created on first use. */
  adapter(): MotionAdapter;
  send(message: PhoneToRelayMessage): void;
  /** Renews the screen wake lock from a tap. */
  keepAwake(): void;
  /** Enters fullscreen with portrait locked, where the phone does that. Called inside the tap. */
  enterFullscreen(): void;
  exitFullscreen(): void;
  /**
   * True when the game needs the gyroscope. Accelerometer-only phones then play with touch
   * (motion.md, owner decision 5). The game contract doesn't say which gestures a game uses yet,
   * so the app passes true.
   */
  needsGyroscope: boolean;
  document?: MotionDocument;
  schedule?: Schedule;
  /** Local clock in ms. */
  now?: () => number;
  /** The real-data check after `granted`. Defaults to `waitForCapability`. */
  waitForData?: (adapter: MotionAdapter) => Promise<MotionCapability>;
}

export interface MotionSession {
  /** The current motion game, or null outside one. */
  readonly state: Readonly<ShallowRef<MotionGame | null>>;
  /** Follows the phone: a `motion-permission` view starts a step, the game ending ends it. */
  follow(phone: PhoneState): void;
  /** "Tap to enable motion". Call it from the tap's click handler, before any `await`. */
  enable(): void;
  /** "Use touch instead". */
  useTouch(): void;
  /** "Ready" on the touch controls screen. */
  acknowledge(): void;
  /** "Tap to resume". Call it from the tap's click handler, before any `await`. */
  resume(): void;
  dispose(): void;
}

const defaultSchedule: Schedule = (callback, delayMs) => {
  const handle = setTimeout(callback, delayMs);
  return () => clearTimeout(handle);
};

export function createMotionSession(options: MotionSessionOptions): MotionSession {
  const doc = options.document ?? globalThis.document;
  const schedule = options.schedule ?? defaultSchedule;
  const now = options.now ?? (() => performance.now());
  const waitForData = options.waitForData ?? ((adapter) => waitForCapability(adapter));
  const state = shallowRef<MotionGame | null>(null);

  /** Bumped whenever pending work belongs to an older flow and must be ignored. */
  let generation = 0;
  /** Stops whatever sensor listener and timers the current flow started. */
  let stopWork: Array<() => void> = [];
  let listening = false;

  const update = (patch: Partial<MotionGame>): void => {
    if (state.value !== null) state.value = { ...state.value, ...patch };
  };

  function stopAll(): void {
    for (const stop of stopWork) stop();
    stopWork = [];
  }

  function sendStatus(status: MotionPermission): void {
    options.send({ t: "motion:status", d: { status } });
  }

  /**
   * Switches this phone to touch and tells the host, unless `tell` is false because the host
   * already counts the phone as touch.
   */
  function toTouch(reason: "denied" | "unsupported", tell = true): void {
    generation += 1;
    stopAll();
    update({
      flow: { kind: "touch", reason, acknowledged: !tell },
      calibration: null,
      paused: false,
    });
    if (tell) sendStatus(reason);
  }

  const onVisibilityChange = (): void => {
    const game = state.value;
    if (game === null || doc.visibilityState !== "hidden") return;
    if (game.flow.kind === "starting" || game.flow.kind === "still") {
      // The browser stops the sensors while hidden. Ask again when the player is back.
      generation += 1;
      stopAll();
      update({ flow: { kind: "ask" } });
    } else if (game.flow.kind === "ready") {
      stopAll();
      update({ paused: true });
    }
  };

  function listen(): void {
    if (listening) return;
    listening = true;
    doc.addEventListener("visibilitychange", onVisibilityChange);
  }

  function end(): void {
    if (state.value === null) return;
    generation += 1;
    stopAll();
    if (listening) doc.removeEventListener("visibilitychange", onVisibilityChange);
    listening = false;
    options.exitFullscreen();
    state.value = null;
  }

  /** Motion rule 7: no sample for 2 s while the game runs and the page is visible means touch. */
  function watchForStall(): void {
    const game = state.value;
    if (game === null || !game.playing || game.flow.kind !== "ready" || game.paused) return;
    stopAll();
    const adapter = options.adapter();
    let lastSampleAt = now();
    const onSample: MotionListener = () => {
      lastSampleAt = now();
    };
    const stopListening = adapter.start(onSample);
    let cancelCheck: (() => void) | undefined;
    const check = (): void => {
      if (doc.visibilityState === "visible" && now() - lastSampleAt >= motionStallMs) {
        toTouch("unsupported");
        return;
      }
      cancelCheck = schedule(check, motionStallCheckMs);
    };
    cancelCheck = schedule(check, motionStallCheckMs);
    stopWork.push(stopListening, () => cancelCheck?.());
  }

  function calibrate(current: number): void {
    const adapter = options.adapter();
    const rest = createRestCalibration();
    update({ flow: { kind: "still", progress: 0 } });
    const stopListening = adapter.start((sample) => {
      if (current !== generation) return;
      const calibration = rest.push(sample);
      if (calibration === null) {
        const progress = Math.min(1, Math.floor((rest.progress().stillMs / stillMs) * 10) / 10);
        const flow = state.value?.flow;
        if (flow?.kind === "still" && flow.progress !== progress) {
          update({ flow: { kind: "still", progress } });
        }
        return;
      }
      stopAll();
      update({ flow: { kind: "ready" }, calibration });
      sendStatus("granted");
      watchForStall();
    });
    const cancelGiveUp = schedule(() => {
      if (current === generation) toTouch("unsupported");
    }, stillGiveUpMs);
    stopWork.push(stopListening, cancelGiveUp);
  }

  return {
    state,

    follow(phone) {
      if (phone.status !== "room") {
        end();
        return;
      }
      const { view, gameId } = phone;
      if (view === null) return;
      const game = state.value;
      if (gameId === null && view.screen === "motion-permission") {
        const step = parseMotionPermissionView(view.data);
        if (step === null) return;
        // The same step again is a reconnect: keep where the phone is.
        if (game !== null && game.step === step.step) return;
        end();
        state.value = {
          ...step,
          flow: { kind: "ask" },
          calibration: null,
          capability: "none",
          playing: false,
          paused: false,
        };
        listen();
        return;
      }
      if (game === null) return;
      if (gameId === game.gameId) {
        if (game.playing) return;
        update({ playing: true });
        // The host started without this phone's answer after 20 s, so it plays with touch.
        const kind = game.flow.kind;
        if (kind === "ask" || kind === "starting" || kind === "still")
          toTouch("unsupported", false);
        else watchForStall();
        return;
      }
      // Any other screen, or another game: this motion game is over.
      end();
    },

    enable() {
      const game = state.value;
      if (game === null || game.flow.kind !== "ask") return;
      const adapter = options.adapter();
      // No await before this call: the browser only asks inside the tap.
      const answer = adapter.request();
      options.keepAwake();
      options.enterFullscreen();
      generation += 1;
      const current = generation;
      update({ flow: { kind: "starting" } });
      void answer
        .then(async (permission) => {
          if (current !== generation) return;
          if (permission !== "granted") {
            toTouch(permission);
            return;
          }
          const capability = await waitForData(adapter);
          if (current !== generation) return;
          update({ capability });
          const usable = options.needsGyroscope ? capability === "full" : capability !== "none";
          if (usable) calibrate(current);
          else toTouch("unsupported");
        })
        .catch(() => {
          if (current === generation) toTouch("unsupported");
        });
    },

    useTouch() {
      if (state.value?.flow.kind !== "ask") return;
      toTouch("denied");
    },

    acknowledge() {
      const flow = state.value?.flow;
      if (flow?.kind !== "touch" || flow.acknowledged) return;
      update({ flow: { ...flow, acknowledged: true } });
    },

    resume() {
      const game = state.value;
      if (game === null || !game.paused) return;
      const adapter = options.adapter();
      // No await before this call: some browsers want a fresh gesture to restart the sensors.
      const answer = adapter.request();
      options.keepAwake();
      options.enterFullscreen();
      generation += 1;
      const current = generation;
      void answer
        .then((permission) => {
          if (current !== generation) return;
          if (permission !== "granted") {
            toTouch(permission);
            return;
          }
          update({ paused: false });
          watchForStall();
        })
        .catch(() => {
          if (current === generation) toTouch("unsupported");
        });
    },

    dispose: end,
  };
}
