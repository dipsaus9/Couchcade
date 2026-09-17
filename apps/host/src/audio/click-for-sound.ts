/**
 * The "Click for sound" chip (docs/architecture/audio.md owner decision 4 and "Unlocking audio"
 * rule 4): shown after a TV refresh, since a refreshed TV rejoins without the passcode screen and
 * so never got a gesture to unlock audio on. Hides the moment `state` becomes `running`, and shows
 * again if the context ever falls back to `locked` (rule 5: Safari suspending on an interruption).
 */
import type { AudioState } from "@couchcade/audio";

export function isClickForSoundVisible(state: AudioState): boolean {
  return state === "locked";
}
