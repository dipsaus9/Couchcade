/**
 * The TV's display lag (docs/architecture/session-flow.md, "TV lag calibration"): how long the TV
 * takes to show a frame the host drew. The host's calibration screen (CC-3.8) measures it and stores
 * it here. It belongs to the laptop and TV pair, so it lives in the host's `localStorage` and stays
 * across rooms and nights.
 *
 * Games never read storage themselves. The host runtime reads `getDisplayLagMs()` and passes the
 * value on as `InputContext.displayLagMs` and `HostSceneData.displayLagMs`.
 */

/** The `localStorage` key on the host. */
export const displayLagStorageKey = "couchcade:display-lag";

/** The largest lag the host keeps. HDMI adds about 20-100 ms, a Chromecast about 150-300 ms. */
export const maxDisplayLagMs = 400;

/** What the host stores. `measuredAt` is Unix epoch milliseconds. */
export interface StoredDisplayLag {
  ms: number;
  measuredAt: number;
}

/** The part of the Web Storage API this module uses, so tests can pass a fake. */
export interface DisplayLagStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Whole milliseconds between 0 and `maxDisplayLagMs`. */
export function clampDisplayLagMs(ms: number): number {
  return Math.min(maxDisplayLagMs, Math.max(0, Math.round(ms)));
}

/**
 * `globalThis.localStorage`, or null where there is none (Node, Workers) or where reading it throws
 * (storage blocked by the browser).
 */
function defaultStorage(): DisplayLagStorage | null {
  try {
    const storage = (globalThis as { localStorage?: DisplayLagStorage }).localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

/** The stored measurement, or null when none is stored, the entry is broken or storage is blocked. */
export function readDisplayLag(
  storage: DisplayLagStorage | null = defaultStorage(),
): StoredDisplayLag | null {
  if (storage === null) return null;
  try {
    const value: unknown = JSON.parse(storage.getItem(displayLagStorageKey) ?? "null");
    if (typeof value !== "object" || value === null) return null;
    const { ms, measuredAt } = value as Record<string, unknown>;
    if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
    if (ms < 0 || ms > maxDisplayLagMs) return null;
    if (typeof measuredAt !== "number" || !Number.isFinite(measuredAt)) return null;
    return { ms: Math.round(ms), measuredAt };
  } catch {
    return null;
  }
}

/**
 * The calibrated display lag in whole milliseconds, or 0 when the TV was never calibrated, the
 * entry is broken or storage can't be read.
 */
export function getDisplayLagMs(storage: DisplayLagStorage | null = defaultStorage()): number {
  return readDisplayLag(storage)?.ms ?? 0;
}

/**
 * Stores a new measurement, clamped to 0-400 ms, and returns what was stored. When storage is
 * blocked nothing is kept, and games go on with 0.
 */
export function saveDisplayLag(
  ms: number,
  measuredAt: number,
  storage: DisplayLagStorage | null = defaultStorage(),
): StoredDisplayLag {
  const stored = { ms: clampDisplayLagMs(ms), measuredAt };
  try {
    storage?.setItem(displayLagStorageKey, JSON.stringify(stored));
  } catch {
    // Storage can be full or blocked. The measurement is lost with the page.
  }
  return stored;
}
