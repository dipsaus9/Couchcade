/**
 * Local one-shot haptics for this controller's cues (docs/HOUSE_STYLE.md, "Motion, sound and
 * haptics"): `press` a 10ms tick, `your-turn` two 40ms pulses, `celebrate` one 120ms pulse, `foul`
 * three short pulses. iPhones don't support vibration in the browser, and the house style says
 * haptics are "always a bonus and never the only feedback", so this is best-effort and silent
 * where unsupported.
 */
import type { CueToken } from "@couchcade/protocol";

/** `Navigator.vibrate` pattern per cue: a number is one burst, an array alternates on/off. */
const patterns: Record<CueToken, number | number[]> = {
  press: 10,
  "your-turn": [40, 40, 40],
  celebrate: 120,
  foul: [50, 50, 50, 50, 50],
};

/** True when this device can be asked to vibrate. */
export function canVibrate(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/** Plays a cue's haptic pattern. Does nothing where `Navigator.vibrate` isn't available. */
export function playCue(cue: CueToken): void {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(patterns[cue]);
  } catch {
    // Some embedded contexts throw instead of omitting the API. Haptics are a bonus, never required.
  }
}
