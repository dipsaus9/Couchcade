/**
 * The game contract from docs/architecture/platform.md, "The contract". A game is a folder
 * `games/<id>` whose `src/index.ts` default-exports `defineGame({ ... })`.
 *
 * Rules for game code (the contract test kit checks what it can):
 * 1. `init`, `onPlayerInput`, `onTick`, `onPlayerLeft`, `view`, `outcome`, `snapshot` and `restore`
 *    are pure. They return new state and never mutate their arguments.
 * 2. `TState` is plain JSON-compatible data. No classes, `Map`, `Set` or functions.
 * 3. Randomness comes from `createRng(seed)` in `@couchcade/utils`, with the RNG state kept in `TState`.
 * 4. Time only arrives as `dtMs` and `InputContext`. No `Math.random`, `Date.now` or `new Date`.
 * 5. Physics games keep the physics world as a cache rebuilt from `TState`.
 * 6. `view` returns only what changes on the phone between turns, never positions per frame.
 */
import type { ZodMiniType } from "zod/mini";
import type { Component } from "vue"; // type-only, erased at build
import type { Scene } from "phaser"; // type-only, erased at build
import { gameIdSchema } from "@couchcade/protocol";
import type { ControllerView, JsonValue, PlayerInfo } from "@couchcade/protocol";
import type { ScenePaletteId } from "@couchcade/theme";

export type Player = PlayerInfo;

export type GameInput = { type: string; payload?: JsonValue };

export interface InputContext {
  /** Game time when the player acted (clock-synced, clamped to at most 500 ms in the past). */
  atMs: number;
  /** Game time of the tick that applies the input. */
  nowMs: number;
  /** Calibrated TV lag (CC-3.8), 0 if not calibrated. */
  displayLagMs: number;
}

export interface Outcome {
  /** `place` starts at 1; ties share a place. */
  placements: Array<{ playerId: string; place: number; score?: number }>;
}

export interface HostSceneData<TState> {
  /** The latest state. The scene reads it every frame and never changes it. */
  getState(): TState;
  players: readonly Player[];
  displayLagMs: number;
  reducedMotion: boolean;
  /**
   * The room code, such as `BEAN`, so a scene can keep the stage room code panel on screen for
   * latecomers. The host always passes it; tests and tools may leave it out.
   */
  roomCode?: string;
  /** The URL a phone opens to join this room, such as `https://couchcade.workers.dev/?room=BEAN`. */
  joinUrl?: string;
  /**
   * Per in-game player: which path their real-time input takes and how far behind to draw their
   * streams (docs/architecture/realtime-link.md, "Game SDK API sketch"). `rttMs` is the link's
   * round trip, `null` on the relay path or before the first measurement. The host runtime always
   * passes it once the link lands (CC-3.20); tests and tools may leave it out until then.
   */
  link?(playerId: string): {
    path: "direct" | "relay";
    rttMs: number | null;
    playbackDelayMs: number;
  };
}

/**
 * What the phone's motion step (CC-5.10) settled on for the running game, handed to its controller.
 *
 * - `motion`: permission granted and the phone calibrated. The controller feeds `adapter` samples
 *   through one pose tracker built from `calibration`.
 * - `touch`: the player chose touch, the browser said no, the phone has no gyroscope, or motion
 *   stopped mid-game. The runtime switches the value when that happens, so a controller follows it.
 *
 * The types are generic because game-sdk (core) may not import `@couchcade/motion` (kit). A
 * controller names them: `ControllerMotion<MotionAdapter, Calibration>`.
 */
export type ControllerMotion<TAdapter = unknown, TCalibration = unknown> =
  | { mode: "motion"; adapter: TAdapter; calibration: TCalibration }
  | { mode: "touch" };

/**
 * Which path a controller's real-time input takes right now, from `@couchcade/game-sdk/input`'s
 * `createInputChannel` (docs/architecture/realtime-link.md, "Connection lifecycle"). For dev
 * readouts and tests only; a game never branches on it.
 */
export type InputChannelPath = "direct" | "relay" | "off";

/**
 * One input channel per controller (owner decision 10, "One capability for every game"): games
 * call `stream` and `fire` without knowing whether the direct WebRTC link or the relay path
 * carries the message (docs/architecture/realtime-link.md, "Game SDK API sketch"). Built by
 * `createInputChannel` in `@couchcade/game-sdk/input`.
 */
export interface InputChannel<TInput extends GameInput> {
  /** A continuous value, one sample. Direct: sent at the stream's rate. Relay: packed, 4 per second. */
  stream(input: TInput, eventTimeStamp?: number): void;
  /** A discrete event. Direct: reliable channel at once. Relay: the input stream's fire rules. */
  fire(input: TInput, eventTimeStamp?: number): void;
  /** The newest value given to `stream` for this type, or null. */
  last<K extends TInput["type"]>(type: K): Extract<TInput, { type: K }> | null;
  /** Drops pending values (volley closed, TV away). */
  clear(): void;
  /** For dev readouts and tests. Games never branch on it. */
  readonly path: InputChannelPath;
}

export interface ControllerProps<TView, TInput extends GameInput, TMotion = ControllerMotion> {
  screen: string;
  data: TView;
  player: Player;
  /** Stamps `at` in room time. Turn-based and one-off input. Unchanged. */
  send(input: TInput, eventTimeStamp?: number): void;
  /**
   * Real-time input over the link when direct, the relay path otherwise
   * (docs/architecture/realtime-link.md). The controller runtime always passes it once the link
   * lands (CC-3.19); tests and tools may leave it out until then.
   */
  input?: InputChannel<TInput>;
  /**
   * Set for a game with `needsMotion` once the motion step ran on this phone, absent otherwise.
   * A motion game treats absent as `touch`, such as after a reload mid-game.
   */
  motion?: TMotion;
}

/**
 * A game's eagerly-safe metadata: everything the menu (and a host refresh's player-count check)
 * needs before any room has picked a game (docs/architecture/platform.md, "Auto-discovery
 * registry"). `games/<id>/src/meta.ts` default-exports one of these, with no other imports beyond
 * plain literals — `apps/host/src/runtime/games.ts` globs it *eagerly*, so it lands in the
 * platform bundle that loads before any game is chosen. The full `CouchcadeGame` (`src/index.ts`,
 * everything below plus the rules) loads lazily, once, only when a room actually starts that game
 * — the same lazy pattern `hostScene` already uses. `index.ts` imports its own `meta.ts` and
 * spreads it into `defineGame`, so the two never drift apart.
 */
export interface GameMeta {
  /** Kebab-case, equal to the folder name games/<id>. */
  id: string;
  /** Sentence case, shown in menus. */
  title: string;
  /** 1 <= min <= max <= 8. */
  players: { min: number; max: number };
  /** true: onTick runs and inputs stream through the batching helper. */
  realtime: boolean;
  /** true: the motion permission step runs before the game. */
  needsMotion: boolean;
  /** "desert", "alley", ... */
  scene: ScenePaletteId;
  /**
   * true while the game isn't playable end to end yet (no controller, TV scene or bot-match E2E
   * test). The host registry still checks it but leaves it out, so the menu never lists it and
   * nothing can start it. The story that registers the game removes the flag.
   */
  hidden?: boolean;
}

export interface CouchcadeGame<
  TInput extends GameInput = GameInput,
  TState = unknown,
  TView extends JsonValue = JsonValue,
> extends GameMeta {
  /** Every input is validated before onPlayerInput. */
  inputSchema: ZodMiniType<TInput>;

  init(players: readonly Player[], seed: number): TState;
  onPlayerInput(state: TState, player: Player, input: TInput, ctx: InputContext): TState;
  /** Fixed 60 Hz step, dtMs is always 1000 / 60. */
  onTick?(state: TState, dtMs: number): TState;
  /** A seat expired mid-game. */
  onPlayerLeft?(state: TState, player: Player): TState;
  view(state: TState, player: Player): ControllerView & { data: TView };
  /** null while the game is running. */
  outcome(state: TState): Outcome | null;

  /**
   * What a refreshed TV resumes the next round from: points, round number and the RNG state. It
   * only changes when a round ends, and stays within `maxGameSnapshotBytes` serialised
   * (docs/architecture/session-flow.md, "Host refresh and deploy recovery").
   */
  snapshot?(state: TState): JsonValue;
  /** Resumes at the start of the round in `snapshot`, with game time back at 0 as after `init`. */
  restore?(players: readonly Player[], seed: number, snapshot: JsonValue): TState;

  /** `() => import("./host/scene").then((m) => m.default)` */
  hostScene: () => Promise<new () => Scene>;
}

/**
 * A game's phone entry: `games/<id>/src/controller/index.ts` default-exports
 * `defineController({ ... })`. Phones load only this, never the game's `src/index.ts`, so physics
 * and host-only shared code stay off them (owner decision, 16 September 2026).
 */
export interface CouchcadeController {
  /** The game id, equal to the folder name games/<id>. */
  id: string;
  /** `() => import("./Controller.vue").then((m) => m.default)` */
  component: () => Promise<Component>;
  /**
   * Input types sent with `input.stream`, and the rate each goes out at on the direct link.
   * Default 30 per second; 60 when a game needs it (docs/architecture/realtime-link.md, "Rates").
   */
  streams?: Readonly<Record<string, { hz?: 30 | 60 }>>;
}

/** Declares a game. Returns the definition unchanged; it exists for type inference. */
export function defineGame<TInput extends GameInput, TState, TView extends JsonValue>(
  game: CouchcadeGame<TInput, TState, TView>,
): CouchcadeGame<TInput, TState, TView> {
  return game;
}

/** Declares a game's eager metadata (`games/<id>/src/meta.ts`). Returns it unchanged. */
export function defineGameMeta(meta: GameMeta): GameMeta {
  return meta;
}

/** Declares a game's phone entry. Returns it unchanged; it exists for type inference. */
export function defineController(controller: CouchcadeController): CouchcadeController {
  return controller;
}

/** Ticks per second of the fixed game step. */
export const tickRate = 60;

/** The fixed step: `dtMs` passed to `onTick`, always 1000 / 60. */
export const tickMs = 1000 / tickRate;

/** How far in the past `InputContext.atMs` may lie before it is clamped. */
export const maxInputAgeMs = 500;

/** Seats a game can have at most: slot 0 to 7. */
export const maxPlayers = 8;

/**
 * Most bytes a game's serialised `snapshot` may take. The rest of the 1 KB `room:snapshot` frame
 * holds the envelope, the in-game player ids, the game time and party progress
 * (docs/architecture/session-flow.md, "What a snapshot holds").
 */
export const maxGameSnapshotBytes = 600;

/** Longest game title, so it fits a menu card (session-flow design, CC-3.1). */
export const maxTitleLength = 16;

/** Game time of a tick. Tick 0 is `init`, tick 1 is the first `onTick`. */
export function tickTimeMs(tick: number): number {
  return (tick * 1000) / tickRate;
}

/** Clamps when a player acted to `[nowMs - maxInputAgeMs, nowMs]`, as the host runtime does. */
export function clampInputAtMs(atMs: number, nowMs: number): number {
  return Math.min(nowMs, Math.max(nowMs - maxInputAgeMs, atMs));
}

/** True for a kebab-case game id such as `quick-draw`. */
export function isGameId(id: unknown): id is string {
  return gameIdSchema.safeParse(id).success;
}

/**
 * The static problems with a game's metadata: missing members, an id that isn't kebab-case, a
 * title over 16 characters, or player bounds outside `1 <= min <= max <= 8`. An empty list means
 * the shape is valid. Shared by `checkGameDefinition` (the full game) and the eager metadata
 * registry, so `games/<id>/src/meta.ts` and `src/index.ts` are checked the same way.
 */
export function checkGameMeta(meta: unknown): string[] {
  if (typeof meta !== "object" || meta === null) return ["is not an object"];
  const g = meta as Record<string, unknown>;
  const problems: string[] = [];

  if (!isGameId(g.id)) problems.push(`id ${JSON.stringify(g.id)} is not kebab-case`);
  if (typeof g.title !== "string" || g.title.trim() === "") problems.push("title is empty");
  if (typeof g.title === "string" && g.title.length > maxTitleLength) {
    problems.push(`title ${JSON.stringify(g.title)} is longer than ${maxTitleLength} characters`);
  }

  const players = g.players as { min?: unknown; max?: unknown } | undefined;
  const { min, max } = players ?? {};
  if (
    !Number.isInteger(min) ||
    !Number.isInteger(max) ||
    (min as number) < 1 ||
    (min as number) > (max as number) ||
    (max as number) > maxPlayers
  ) {
    problems.push(
      `players ${JSON.stringify(players)} must be integers with 1 <= min <= max <= ${maxPlayers}`,
    );
  }

  for (const key of ["realtime", "needsMotion"] as const) {
    if (typeof g[key] !== "boolean") problems.push(`${key} is not a boolean`);
  }
  if (g.hidden !== undefined && typeof g.hidden !== "boolean")
    problems.push("hidden is not a boolean");
  if (typeof g.scene !== "string" || g.scene === "") problems.push("scene is empty");

  return problems;
}

/**
 * The static problems with a full game definition: everything `checkGameMeta` checks, plus a
 * missing `inputSchema` or rule function. An empty list means the shape is valid. Behaviour
 * (purity, determinism) is checked by `testGameContract` in `@couchcade/game-sdk/testing`.
 */
export function checkGameDefinition(game: unknown): string[] {
  if (typeof game !== "object" || game === null) return ["is not an object"];
  const g = game as Record<string, unknown>;
  const problems = checkGameMeta(g);

  const schema = g.inputSchema as { safeParse?: unknown } | undefined;
  if (typeof schema?.safeParse !== "function") problems.push("inputSchema is not a zod schema");

  for (const key of ["init", "onPlayerInput", "view", "outcome", "hostScene"]) {
    if (typeof g[key] !== "function") problems.push(`${key} is not a function`);
  }
  for (const key of ["onTick", "onPlayerLeft", "snapshot", "restore"]) {
    if (g[key] !== undefined && typeof g[key] !== "function") {
      problems.push(`${key} is not a function`);
    }
  }
  if ((g.snapshot === undefined) !== (g.restore === undefined)) {
    problems.push("snapshot and restore come as a pair");
  }
  return problems;
}

/**
 * The problems with a controller entry: an id that isn't kebab-case or a missing `component`
 * loader. An empty list means the shape is valid.
 */
export function checkControllerDefinition(controller: unknown): string[] {
  if (typeof controller !== "object" || controller === null) return ["is not an object"];
  const c = controller as Record<string, unknown>;
  const problems: string[] = [];
  if (!isGameId(c.id)) problems.push(`id ${JSON.stringify(c.id)} is not kebab-case`);
  if (typeof c.component !== "function") problems.push("component is not a function");
  return problems;
}
