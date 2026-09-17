/**
 * Applies the laptop's stored volumes to `audio` (docs/architecture/audio.md "Host settings"):
 * CC-7.6 builds the `apps/host/src/settings/` module that stores them (mute toggle, two sliders,
 * the `M` key) in `localStorage` under `couchcade:host-settings`; CC-7.4 is the read-and-apply
 * side the doc assigns it, so muting silences everything the moment CC-7.6's UI writes here, and
 * the stored defaults (muted false, music 6, effects 8, docs/architecture/audio.md "Host
 * settings") already apply before it exists. Mirrors
 * `packages/game-sdk/src/clock/display-lag.ts`'s storage pattern.
 */
import { audio, defaultVolumes } from "@couchcade/audio";
import type { Volumes } from "@couchcade/audio";

/** The `localStorage` key on the host. Shared with CC-7.6. */
export const hostSettingsStorageKey = "couchcade:host-settings";

/** The part of the Web Storage API this module uses, so tests can pass a fake. */
export interface HostSettingsStorage {
  getItem(key: string): string | null;
}

/**
 * `globalThis.localStorage`, or null where there is none (tests, a page with no DOM) or where
 * reading it throws (storage blocked by the browser).
 */
function defaultStorage(): HostSettingsStorage | null {
  try {
    const storage = (globalThis as { localStorage?: HostSettingsStorage }).localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * The stored volumes, or the defaults when nothing is stored, the entry is unreadable, or it's an
 * older `v`. Access is wrapped in `try`, since `localStorage` can throw in private windows.
 */
export function readVolumes(storage: HostSettingsStorage | null = defaultStorage()): Volumes {
  if (storage === null) return { ...defaultVolumes };
  try {
    const value: unknown = JSON.parse(storage.getItem(hostSettingsStorageKey) ?? "null");
    if (typeof value !== "object" || value === null) return { ...defaultVolumes };
    const { v, muted, music, effects } = value as Record<string, unknown>;
    if (v !== 1) return { ...defaultVolumes };
    if (typeof muted !== "boolean") return { ...defaultVolumes };
    if (!isFiniteNumber(music) || !isFiniteNumber(effects)) return { ...defaultVolumes };
    return { muted, music, effects };
  } catch {
    return { ...defaultVolumes };
  }
}

/** Reads the stored volumes and applies them to `audio`. Call once, at boot. */
export function applyHostSettings(storage?: HostSettingsStorage | null): void {
  audio.setVolumes(readVolumes(storage));
}
