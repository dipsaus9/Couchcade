/**
 * The one reactive copy of the host settings, shared by `SoundSettings.vue` (the sliders and
 * toggles) and `mute-hotkey.ts` (the `M` key), so either can change `muted` and the other sees it
 * without a round trip through `localStorage`.
 */
import { ref } from "vue";
import { readSettings, writeSettings } from "./settings-storage.ts";
import type { HostSettings } from "./settings-storage.ts";

export const settings = ref<HostSettings>(readSettings());

/** Merges `patch` into the settings, persists it, and applies the volumes to `audio`. */
export function patchSettings(patch: Partial<HostSettings>): void {
  settings.value = { ...settings.value, ...patch };
  writeSettings(settings.value);
}

export function toggleMuted(): void {
  patchSettings({ muted: !settings.value.muted });
}
