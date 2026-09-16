import { maxFrameBytes, utf8ByteLength } from "@couchcade/protocol";
import type { ControllerView, HostToRelayMessage } from "@couchcade/protocol";
import type { Scheduler } from "./timing.ts";

/**
 * The host sends `controller:state` at most 1.5 times per second, at least 667 ms apart
 * (docs/architecture/platform.md, "The caps"). The doc homes both caps in
 * `@couchcade/game-sdk/input`, which CC-3.6 builds; move this constant there then.
 */
export const controllerStateMinGapMs = 667;

type ControllerStateMessage = Extract<HostToRelayMessage, { t: "controller:state" }>;
/** A `controller:state` entry addressed to phones by id, never to a group. */
type ViewEntry = { to: string[]; view: ControllerView };

export interface ViewSyncOptions {
  send(message: ControllerStateMessage): void;
  /** Local clock in milliseconds. */
  now(): number;
  schedule: Scheduler;
  warn(message: string): void;
  minGapMs?: number;
}

export interface ViewSync {
  /**
   * Sets what each phone should show now, by player id. Views that differ from the last one sent
   * to that phone go out at once when the send window is open, otherwise when it opens, merged
   * with any later change. Phones missing from `views` keep what they have.
   */
  show(gameId: string | null, views: ReadonlyMap<string, ControllerView>): void;
  /**
   * Forgets what phone `id` was last sent, so the next `show` includes its view even when it
   * didn't change. For a phone that reconnected (docs/architecture/session-flow.md, "Phone
   * reconnect"). It sends nothing itself and the send cap still applies.
   */
  forget(id: string): void;
  /** Cancels a pending send. */
  dispose(): void;
}

/**
 * Diffs views per phone and batches them into `controller:state` (platform.md, "How the host runs
 * a game", step 5, and budget rule 5): only changed entries, phones with the same view share one
 * entry, at most one send per window, split over several frames only when 1 KB isn't enough.
 */
export function createViewSync(options: ViewSyncOptions): ViewSync {
  const minGapMs = options.minGapMs ?? controllerStateMinGapMs;
  const lastSent = new Map<string, string>();
  let desired: { gameId: string | null; views: ReadonlyMap<string, ControllerView> } | null = null;
  let lastSendAt = Number.NEGATIVE_INFINITY;
  let cancelTimer: (() => void) | null = null;

  const flush = (): void => {
    if (desired === null) return;
    const now = options.now();
    const waitMs = lastSendAt + minGapMs - now;
    // A send is already booked for when the window opens, and it reads the latest views then.
    if (waitMs > 0 && cancelTimer !== null) return;

    const { gameId, views } = desired;
    const changed = [...views].filter(([id, view]) => lastSent.get(id) !== keyOf(gameId, view));
    if (changed.length === 0) return;

    if (waitMs > 0) {
      cancelTimer = options.schedule(() => {
        cancelTimer = null;
        flush();
      }, waitMs);
      return;
    }

    const messages = pack(gameId, group(changed), options.warn);
    if (messages.length > 1) {
      options.warn(
        `controller:state split over ${messages.length} frames to stay under ${maxFrameBytes} bytes`,
      );
    }
    for (const message of messages) options.send(message);
    for (const [id, view] of changed) lastSent.set(id, keyOf(gameId, view));
    lastSendAt = now;
  };

  return {
    show(gameId, views) {
      desired = { gameId, views };
      flush();
    },
    forget(id) {
      lastSent.delete(id);
    },
    dispose() {
      cancelTimer?.();
      cancelTimer = null;
      desired = null;
    },
  };
}

/** What a phone was last sent: the game id and its view. */
function keyOf(gameId: string | null, view: ControllerView): string {
  return JSON.stringify([gameId, view]);
}

/** One entry per distinct view, listing every phone that gets it, in the order phones came. */
function group(changed: ReadonlyArray<[string, ControllerView]>): ViewEntry[] {
  const entries = new Map<string, ViewEntry>();
  for (const [id, view] of changed) {
    const key = JSON.stringify(view);
    const entry = entries.get(key);
    if (entry) entry.to.push(id);
    else entries.set(key, { to: [id], view });
  }
  return [...entries.values()];
}

function messageOf(gameId: string | null, views: ViewEntry[]): ControllerStateMessage {
  return { t: "controller:state", d: { gameId, views } };
}

/** The frame size `encode` measures. */
function bytesOf(gameId: string | null, views: ViewEntry[]): number {
  return utf8ByteLength(JSON.stringify(messageOf(gameId, views)));
}

/** Packs entries into as few frames of at most 1 KB as the greedy order allows. */
function pack(
  gameId: string | null,
  entries: ViewEntry[],
  warn: (message: string) => void,
): ControllerStateMessage[] {
  const fitting = entries.flatMap((entry) => fit(gameId, entry, warn));
  const messages: ControllerStateMessage[] = [];
  let batch: ViewEntry[] = [];
  for (const entry of fitting) {
    if (batch.length > 0 && bytesOf(gameId, [...batch, entry]) > maxFrameBytes) {
      messages.push(messageOf(gameId, batch));
      batch = [];
    }
    batch.push(entry);
  }
  if (batch.length > 0) messages.push(messageOf(gameId, batch));
  return messages;
}

/**
 * An entry that fits a frame on its own. A shared entry too big for one frame is halved by phones;
 * a view too big even for one phone is a game bug, so it is dropped with a warning.
 */
function fit(
  gameId: string | null,
  entry: ViewEntry,
  warn: (message: string) => void,
): ViewEntry[] {
  if (bytesOf(gameId, [entry]) <= maxFrameBytes) return [entry];
  if (entry.to.length === 1) {
    warn(
      `view ${JSON.stringify(entry.view.screen)} for ${entry.to[0]} is over ${maxFrameBytes} bytes, dropped`,
    );
    return [];
  }
  const half = Math.ceil(entry.to.length / 2);
  return [
    ...fit(gameId, { to: entry.to.slice(0, half), view: entry.view }, warn),
    ...fit(gameId, { to: entry.to.slice(half), view: entry.view }, warn),
  ];
}
