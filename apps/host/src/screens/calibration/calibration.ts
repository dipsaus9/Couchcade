import type { ClockScheduler } from "@couchcade/game-sdk/clock";
import { clampDisplayLagMs } from "@couchcade/game-sdk/clock";
import type { ControllerView, PayloadOf, PlayerInfo } from "@couchcade/protocol";
import { seatedPlayers, vip, type LobbyState } from "../lobby/lobby-state.ts";

// TV lag calibration (docs/architecture/session-flow.md, "TV lag calibration", owner decision 1).
//
// Players tap ALONG with a flash that repeats on a steady beat, in time with it, not after it. A
// player keeping time taps when they see the flash, so the tap lands at
//
//   at = flashAt + displayLag + (small timing error around 0)
//
// where `flashAt` is the room time of the animation frame that drew the flash on the host and
// `at` is the room time of the tap, from the tap event's own timestamp. Network lag doesn't enter:
// `at` is stamped on the phone in room time (platform.md, "Clock sync"). Reaction time doesn't
// enter either: after the practice flashes players anticipate the beat instead of reacting to it.
//
// So each tap's offset `at - flashAt` estimates the display lag, and the median ignores the odd
// early or late tap.
//
// Outliers:
// - A tap is matched to the nearest flash that was drawn. A tap more than half a beat (375 ms)
//   from every flash is thrown away, and so is a tap whose nearest flash is a practice flash.
// - A player gets one offset per flash: the tap closest to it. A double tap doesn't count twice.
// - A player needs 3 matched taps for a median. Players with fewer are left out.
// - The room value is the median of the players' medians, so one player who was off the beat
//   doesn't move it, clamped to 0-400 ms.

/** The steady beat. */
export const beatMs = 750;
/** How long each flash stays lit. */
export const flashMs = 150;
/** The first flashes teach the beat and don't count. */
export const practiceFlashes = 3;
/** Flashes whose taps count. */
export const countingFlashes = 5;
export const totalFlashes = practiceFlashes + countingFlashes;
/** A tap further than half a beat from every flash is thrown away. */
export const matchWindowMs = beatMs / 2;
/** Matched taps a player needs before their median counts. */
export const minMatchedTaps = 3;
/** Time for the phones to show the tap button before the first flash. */
export const leadInMs = 1000;
/** After the last flash, taps still in flight get this long to arrive. */
export const settleMs = 1000;

export type CalibrationTap = PayloadOf<"calibration:tap">;
export type UiAction = PayloadOf<"ui:action">;

/** What the TV draws on one animation frame. */
export interface FlashFrame {
  /** 0-based flash number. */
  index: number;
  /** True while this flash is lit. */
  lit: boolean;
  /** True for the first 3 flashes. */
  practice: boolean;
}

/**
 * The beat at `roomTime`: which flash it is and whether it is lit. Null before the first flash and
 * after the last one has gone dark.
 */
export function flashFrameAt(startsAt: number, roomTime: number): FlashFrame | null {
  const sinceStart = roomTime - startsAt;
  if (sinceStart < 0) return null;
  const index = Math.floor(sinceStart / beatMs);
  if (index >= totalFlashes) return null;
  return { index, lit: sinceStart - index * beatMs < flashMs, practice: index < practiceFlashes };
}

/** The middle value, or the mean of the two middle values. Null for no values. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * Matches a tap to the nearest drawn flash. `flashes[i]` is the room time flash `i` was first drawn,
 * or null when it never was (a hidden tab draws no frames). Returns the counting flash and the
 * offset `at - flashAt`, or null for a tap more than half a beat from every flash or nearest a
 * practice flash.
 */
export function matchTap(
  at: number,
  flashes: readonly (number | null)[],
): { index: number; offsetMs: number } | null {
  let match: { index: number; offsetMs: number } | null = null;
  for (const [index, flashAt] of flashes.entries()) {
    if (flashAt === null) continue;
    const offsetMs = at - flashAt;
    if (match === null || Math.abs(offsetMs) < Math.abs(match.offsetMs)) {
      match = { index, offsetMs };
    }
  }
  if (match === null || Math.abs(match.offsetMs) > matchWindowMs) return null;
  return match.index < practiceFlashes ? null : match;
}

/** One player's matched offsets and the median of them. */
export interface PlayerMeasurement {
  /** Offset per counting flash, closest tap only. */
  offsets: Map<number, number>;
  /** The offset of the player's latest matched tap, for the "Last tap" chip. */
  lastMs: number | null;
  /** The median offset once the player has `minMatchedTaps`, else null. */
  lagMs: number | null;
}

export interface Measurement {
  players: Map<string, PlayerMeasurement>;
  /** The median of the player medians, clamped to 0-400 ms. Null when no player has 3 taps. */
  lagMs: number | null;
}

/** Works out the display lag from the drawn flashes and every tap, in arrival order. */
export function measure(
  flashes: readonly (number | null)[],
  taps: ReadonlyArray<{ from: string; at: number }>,
): Measurement {
  const players = new Map<string, PlayerMeasurement>();
  for (const { from, at } of taps) {
    const match = matchTap(at, flashes);
    if (match === null) continue;
    const player = players.get(from) ?? { offsets: new Map(), lastMs: null, lagMs: null };
    const previous = player.offsets.get(match.index);
    if (previous === undefined || Math.abs(match.offsetMs) < Math.abs(previous)) {
      player.offsets.set(match.index, match.offsetMs);
    }
    player.lastMs = match.offsetMs;
    players.set(from, player);
  }
  const medians: number[] = [];
  for (const player of players.values()) {
    if (player.offsets.size < minMatchedTaps) continue;
    player.lagMs = median([...player.offsets.values()]);
    medians.push(player.lagMs!);
  }
  const room = median(medians);
  return { players, lagMs: room === null ? null : clampDisplayLagMs(room) };
}

/** The `calibration` view a seated phone gets. `active` is true while taps count. */
export type CalibrationView = {
  vip: boolean;
  active: boolean;
};

/** `running` while the flashes play, `retry` when nobody got 3 matched taps. */
export type CalibrationStatus = "running" | "retry";

export interface CalibrationOptions {
  /** The latest lobby state: who is seated and who is VIP. */
  lobby(): LobbyState | null;
  /** Room time now, in milliseconds. */
  roomNow(): number;
  schedule: ClockScheduler;
  /** The flashes ended with a value, already clamped. The runtime stores it and goes to the lobby. */
  onMeasured(lagMs: number): void;
  /** The VIP skipped from their phone. */
  onSkip(): void;
  /** Status, taps or the running value changed. */
  onChange(): void;
}

export interface Calibration {
  readonly status: CalibrationStatus;
  /** Room time of the first flash. */
  readonly startsAt: number;
  /** The measurement from the taps so far. */
  measurement(): Measurement;
  /**
   * Called on every animation frame with that frame's room time. Returns what to draw, and
   * remembers the frame that first draws each flash as that flash's `flashAt`.
   */
  frame(roomTime: number): FlashFrame | null;
  /** A `calibration:tap` from a phone. Only seated players count, and only while running. */
  tap(from: string, tap: CalibrationTap): void;
  /** A `ui:action`: `skip-calibration` from the VIP skips. Everything else is ignored. */
  action(from: string, action: UiAction): void;
  /** Starts the flashes again after "Let's try that again". */
  retry(): void;
  /** What each seated phone shows, by player id. */
  views(): Map<string, ControllerView>;
  /** Cancels the end timer. */
  dispose(): void;
}

/** Everything a flash sequence records. */
interface Run {
  startsAt: number;
  flashes: (number | null)[];
  taps: Array<{ from: string; at: number }>;
}

/**
 * One TV lag check: 3 practice flashes and 5 that count, on a 750 ms beat, after a 1 second lead-in.
 * About 7 seconds from start to value. It owns one timer and no socket.
 */
export function createCalibration(options: CalibrationOptions): Calibration {
  let status: CalibrationStatus = "running";
  let run: Run = newRun();
  let cancelTimer: (() => void) | null = null;

  function newRun(): Run {
    return {
      startsAt: Math.round(options.roomNow()) + leadInMs,
      flashes: Array.from({ length: totalFlashes }, () => null),
      taps: [],
    };
  }

  function stopTimer(): void {
    cancelTimer?.();
    cancelTimer = null;
  }

  function begin(): void {
    stopTimer();
    status = "running";
    run = newRun();
    const current = run;
    const endsAt = current.startsAt + (totalFlashes - 1) * beatMs + flashMs + settleMs;
    cancelTimer = options.schedule(
      () => {
        cancelTimer = null;
        if (run !== current) return;
        const { lagMs } = measure(current.flashes, current.taps);
        if (lagMs === null) {
          status = "retry";
          options.onChange();
        } else {
          options.onMeasured(lagMs);
        }
      },
      endsAt - Math.round(options.roomNow()),
    );
  }

  const seated = (from: string): PlayerInfo | undefined => {
    const lobby = options.lobby();
    return lobby === null ? undefined : seatedPlayers(lobby).find((p) => p.id === from);
  };

  begin();

  return {
    get status() {
      return status;
    },
    get startsAt() {
      return run.startsAt;
    },

    measurement: () => measure(run.flashes, run.taps),

    frame(roomTime) {
      if (status !== "running") return null;
      const frame = flashFrameAt(run.startsAt, roomTime);
      if (frame?.lit && run.flashes[frame.index] === null) run.flashes[frame.index] = roomTime;
      return frame;
    },

    tap(from, { at }) {
      if (status !== "running" || seated(from) === undefined) return;
      const before = measure(run.flashes, run.taps);
      run.taps.push({ from, at });
      // Only a tap that changed what the TV shows redraws it.
      const after = measure(run.flashes, run.taps);
      if (
        after.lagMs !== before.lagMs ||
        after.players.get(from)?.lastMs !== before.players.get(from)?.lastMs
      ) {
        options.onChange();
      }
    },

    action(from, { action }) {
      if (action !== "skip-calibration") return;
      const lobby = options.lobby();
      if (lobby === null || from !== vip(lobby)?.id) return;
      stopTimer();
      options.onSkip();
    },

    retry() {
      if (status !== "retry") return;
      begin();
      options.onChange();
    },

    views() {
      const lobby = options.lobby();
      const views = new Map<string, ControllerView>();
      if (lobby === null) return views;
      const leader = vip(lobby)?.id;
      for (const player of seatedPlayers(lobby)) {
        const data: CalibrationView = { vip: player.id === leader, active: status === "running" };
        views.set(player.id, { screen: "calibration", data });
      }
      return views;
    },

    dispose: stopTimer,
  };
}
