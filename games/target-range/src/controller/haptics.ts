/**
 * One-shot haptics for this controller's cues (docs/HOUSE_STYLE.md, "Motion, sound and haptics"):
 * `press` a 10 ms tick, `your-turn` two 40 ms pulses, `celebrate` one 120 ms pulse. iPhones can't
 * vibrate from the browser, and haptics are never the only feedback, so this is best effort.
 */
import type { CueToken } from "@couchcade/protocol";

const patterns: Record<CueToken, number | number[]> = {
  press: 10,
  "your-turn": [40, 40, 40],
  celebrate: 120,
  foul: [50, 50, 50, 50, 50],
};

/** Plays a cue's pattern. Does nothing where `navigator.vibrate` isn't there. */
export function playCue(cue: CueToken): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(patterns[cue]);
  } catch {
    // Some embedded browsers throw instead of leaving the API out. Haptics are a bonus.
  }
}
