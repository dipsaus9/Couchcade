import { maxGameSnapshotBytes, tickTimeMs } from "@couchcade/game-sdk/contract";
import type { CouchcadeGame, Player } from "@couchcade/game-sdk/contract";
import type { GameRegistry } from "@couchcade/game-sdk/registry";
import { jsonValueSchema, maxFrameBytes, utf8ByteLength } from "@couchcade/protocol";
import type { HostToRelayMessage, JsonValue, PayloadOf, RoomPhase } from "@couchcade/protocol";
import * as z from "zod/mini";
import type { GameRunner } from "./game-runner.ts";
import type { Scheduler } from "./timing.ts";

// Round snapshots and TV refresh recovery (docs/architecture/session-flow.md, "Host refresh and
// deploy recovery").

/** A `room:snapshot` payload: `{ round, gameId, data }`. */
export type RoomSnapshot = PayloadOf<"room:snapshot">;

/** What a snapshot's `data` holds for a game with `snapshot` (session-flow.md, "What a snapshot holds"). */
export interface SnapshotData {
  /** In-game player ids, in `init` order. */
  p: string[];
  /** Game time when the snapshot was taken. */
  t: number;
  /** The game's own `snapshot(state)`. */
  g: JsonValue;
  /** Reserved for party mode progress (CC-8.1). */
  party?: JsonValue;
}

const snapshotDataSchema = z.object({
  p: z.array(z.string()),
  t: z.number(),
  g: jsonValueSchema,
  party: z.optional(jsonValueSchema),
});

/** The host checks the game's snapshot every this many ticks: twice a second. */
export const snapshotCheckTicks = 30;

/** At most one snapshot this often. A change inside the window waits, and the latest value wins. */
export const snapshotMinGapMs = 5000;

/** The TV menu line after a refresh ended a game it couldn't resume. */
export const tvRestartedNotice = "The TV restarted, so that game ended";

/** Where the stored snapshot left off, for a game restored from it. */
export interface SnapshotResume {
  round: number;
  g: JsonValue;
}

export interface SnapshotSenderOptions {
  game: CouchcadeGame;
  runner: GameRunner;
  send(message: Extract<HostToRelayMessage, { t: "room:snapshot" }>): void;
  /** Local clock in milliseconds. */
  now(): number;
  schedule: Scheduler;
  warn(message: string): void;
  /**
   * Set for a restored game: the stored snapshot stays as it is, and the next one counts on from
   * its round. Without it, round 0 goes out at once and replaces any earlier game's snapshot.
   */
  resume?: SnapshotResume;
}

export interface SnapshotSender {
  /** Call after every tick that didn't end the game. */
  tick(): void;
  /** The game ended or stopped: nothing more is sent. */
  stop(): void;
}

/**
 * Sends `room:snapshot` for one running game (session-flow.md, "When the host sends a snapshot"):
 * round 0 right after `init`, then every 30 ticks it serialises `snapshot(state)` and sends it with
 * the round one higher when it changed, at most once every 5 seconds. A game part over 600 bytes is
 * skipped with a dev error.
 */
export function createSnapshotSender(options: SnapshotSenderOptions): SnapshotSender {
  const { game, runner } = options;
  let round = options.resume?.round ?? 0;
  let lastSent = options.resume === undefined ? null : JSON.stringify(options.resume.g);
  let lastSentAt = Number.NEGATIVE_INFINITY;
  let lastRejected: string | null = null;
  let pending: { g: string; t: number } | null = null;
  let cancelTimer: (() => void) | null = null;
  let stopped = false;

  /** The game's snapshot serialised, or null when the game has none or it is too big. */
  const serialise = (): string | null => {
    if (!game.snapshot) return null;
    const g = JSON.stringify(game.snapshot(runner.state));
    const bytes = utf8ByteLength(g);
    if (bytes <= maxGameSnapshotBytes) return g;
    // Once per value, so a game stuck over the limit doesn't log twice a second.
    if (g !== lastRejected) {
      options.warn(
        `${game.id} snapshot is ${bytes} bytes, over the ${maxGameSnapshotBytes} byte limit, skipped`,
      );
    }
    lastRejected = g;
    return null;
  };

  const send = (data: JsonValue): boolean => {
    const message = { t: "room:snapshot" as const, d: { round, gameId: game.id, data } };
    const bytes = utf8ByteLength(JSON.stringify(message));
    if (bytes > maxFrameBytes) {
      options.warn(`${game.id} room:snapshot is ${bytes} bytes, over ${maxFrameBytes}, skipped`);
      return false;
    }
    options.send(message);
    lastSentAt = options.now();
    return true;
  };

  /** `SnapshotData` for the game's serialised snapshot `g`, taken at game time `t`. */
  const dataOf = (g: string, t: number): JsonValue => ({
    p: runner.players.map((player) => player.id),
    t,
    g: JSON.parse(g) as JsonValue,
  });

  const flush = (): void => {
    if (stopped || pending === null || cancelTimer !== null) return;
    const waitMs = lastSentAt + snapshotMinGapMs - options.now();
    if (waitMs > 0) {
      cancelTimer = options.schedule(() => {
        cancelTimer = null;
        flush();
      }, waitMs);
      return;
    }
    const { g, t } = pending;
    pending = null;
    if (g === lastSent) return;
    round += 1;
    if (send(dataOf(g, t))) lastSent = g;
    else round -= 1;
  };

  if (options.resume === undefined) {
    const g = serialise();
    const data = g === null ? null : dataOf(g, tickTimeMs(runner.tick));
    if (!send(data) && data !== null) send(null);
    lastSent = g;
  }

  return {
    tick() {
      if (stopped || !game.snapshot || runner.tick % snapshotCheckTicks !== 0) return;
      const g = serialise();
      if (g === null) return;
      if (g === lastSent && pending === null) return;
      pending = { g, t: tickTimeMs(runner.tick) };
      flush();
    },
    stop() {
      stopped = true;
      cancelTimer?.();
      cancelTimer = null;
      pending = null;
    },
  };
}

/** Where a refreshed TV goes, from the room's stored phase and snapshot. */
export type RecoveryPlan =
  | { to: "lobby" }
  | { to: "menu"; notice: string | null }
  | {
      to: "playing";
      game: CouchcadeGame;
      /** The in-game players still seated, in `init` order. */
      players: Player[];
      resume: SnapshotResume;
    };

export interface RecoveryFacts {
  /** The phase the relay stored, from `room:welcome`. */
  phase: RoomPhase;
  /** The `room:snapshot` the relay sent after the welcome, or null. */
  snapshot: RoomSnapshot | null;
  registry: GameRegistry;
  /** The seated players the relay told the host about. */
  seated: readonly Player[];
}

/**
 * The recovery table (session-flow.md, "Recovery"): a game in `playing` with a usable snapshot
 * resumes, any other `playing` goes to the menu with a notice, `menu`, `motion-check` and
 * `results` go to the menu, and `lobby` and `calibration` go to the lobby.
 *
 * The TV only knows the players that are still seated, so a game whose remaining in-game players
 * no longer reach its minimum ends too.
 */
export function planRecovery({ phase, snapshot, registry, seated }: RecoveryFacts): RecoveryPlan {
  switch (phase) {
    case "lobby":
    case "calibration":
    case "party":
      return { to: "lobby" };
    case "menu":
    case "motion-check":
    case "results":
      return { to: "menu", notice: null };
    case "playing":
      break;
  }
  const ended = { to: "menu", notice: tvRestartedNotice } as const;
  const game = snapshot?.gameId == null ? undefined : registry.get(snapshot.gameId);
  const parsed = snapshotDataSchema.safeParse(snapshot?.data);
  if (!snapshot || !game?.restore || !parsed.success) return ended;
  const players = parsed.data.p.flatMap((id) => seated.filter((player) => player.id === id));
  if (players.length < game.players.min) return ended;
  return { to: "playing", game, players, resume: { round: snapshot.round, g: parsed.data.g } };
}
