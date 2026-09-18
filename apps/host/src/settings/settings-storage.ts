/**
 * The host settings CC-7.6 owns (docs/architecture/audio.md "Host settings"): mute, the two
 * volumes, and reduced motion, all in the one `couchcade:host-settings` localStorage entry CC-7.4
 * already reads for `muted`/`music`/`effects`. This module is the write side, plus the one extra
 * field (`reducedMotion`) CC-7.4 never reads.
 *
 * The mute/music/effects trio reuses CC-7.4's `readVolumes` verbatim, so the two read paths can
 * never disagree about what a broken or older entry falls back to. `reducedMotion` gets its own,
 * independently defaulted read: the doc's default for it isn't a fixed value but "the laptop's
 * `prefers-reduced-motion`", so a missing or invalid entry falls back to that media query instead
 * of a constant.
 */
import { audio } from "@couchcade/audio";
import type { Volumes } from "@couchcade/audio";
import { hostSettingsStorageKey, readVolumes } from "../audio/host-settings.ts";
import type { HostSettingsStorage } from "../audio/host-settings.ts";

export interface HostSettings extends Volumes {
  reducedMotion: boolean;
}

/** The part of the Web Storage API this module writes with, so tests can pass a fake. */
export interface HostSettingsWritableStorage extends HostSettingsStorage {
  setItem(key: string, value: string): void;
}

export const defaultReducedMotion = (): boolean => {
  try {
    return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    // matchMedia can throw in a page with no DOM (tests) or a locked-down browser.
    return false;
  }
};

/**
 * `globalThis.localStorage`, or null where there is none (tests, a page with no DOM) or where
 * reading or writing it throws (storage blocked by the browser). Mirrors `../audio/host-
 * settings.ts`'s `defaultStorage`, which can't be reused here since it only exposes `getItem`.
 */
function defaultStorage(): HostSettingsWritableStorage | null {
  try {
    const storage = (globalThis as { localStorage?: HostSettingsWritableStorage }).localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

/**
 * The stored `reducedMotion`, or `prefers()` when nothing is stored, the entry is unreadable, or
 * it's an older `v`. Access is wrapped in `try`, since `localStorage` can throw in private
 * windows.
 */
export function readReducedMotion(
  storage: HostSettingsStorage | null = defaultStorage(),
  prefers: () => boolean = defaultReducedMotion,
): boolean {
  if (storage === null) return prefers();
  try {
    const value: unknown = JSON.parse(storage.getItem(hostSettingsStorageKey) ?? "null");
    if (typeof value !== "object" || value === null) return prefers();
    const { v, reducedMotion } = value as Record<string, unknown>;
    if (v !== 1 || typeof reducedMotion !== "boolean") return prefers();
    return reducedMotion;
  } catch {
    return prefers();
  }
}

/** The full stored settings, or the defaults for any field that's missing or unreadable. */
export function readSettings(
  storage: HostSettingsStorage | null = defaultStorage(),
  prefers: () => boolean = defaultReducedMotion,
): HostSettings {
  return { ...readVolumes(storage), reducedMotion: readReducedMotion(storage, prefers) };
}

/**
 * Writes the settings to `localStorage` (wrapped in `try`, since it can throw in private windows
 * or when full) and applies the volumes to `audio` directly, so a change the laptop makes takes
 * effect immediately even if it fails to persist.
 */
export function writeSettings(
  next: HostSettings,
  storage: HostSettingsWritableStorage | null = defaultStorage(),
): void {
  if (storage !== null) {
    try {
      storage.setItem(hostSettingsStorageKey, JSON.stringify({ v: 1, ...next }));
    } catch {
      // Blocked or full storage: the change just doesn't outlive this session.
    }
  }
  const volumes: Volumes = { muted: next.muted, music: next.music, effects: next.effects };
  audio.setVolumes(volumes);
}
