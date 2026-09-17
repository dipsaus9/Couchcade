/**
 * `@couchcade/ui/haptics`: one-shot phone vibration for a `controller:state` view's `cue`
 * (docs/architecture/audio.md, "Phone haptics"; docs/HOUSE_STYLE.md, "Motion, sound and
 * haptics"): `press` a 10 ms tick, `your-turn` two 40 ms pulses, `celebrate` one 120 ms pulse,
 * `foul` three short pulses. iPhones and Firefox for Android don't support `navigator.vibrate`,
 * and haptics are always a bonus, never the only feedback, so this is best effort and silent
 * where unsupported.
 */
import type { CueToken } from "@couchcade/protocol";

/** `Navigator.vibrate` pattern per cue: a number is one burst, an array alternates on/off. */
export const hapticPatterns: Record<CueToken, number | number[]> = {
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
export function haptic(token: CueToken): void {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(hapticPatterns[token]);
  } catch {
    // Some embedded contexts throw instead of omitting the API. Haptics are a bonus, never required.
  }
}
