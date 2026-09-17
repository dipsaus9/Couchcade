/**
 * Opening the browser's autoplay lock (docs/architecture/audio.md "Unlocking audio the autoplay
 * rule").
 */
import { audio } from "@couchcade/audio";

/**
 * Unlocks audio, then runs `submit` (rule 1: the passcode submit's first statement, before `busy`
 * changes and before the request starts). Wraps the whole submit handler, not just the request, so
 * unlock() really is the first statement rather than the first statement after the busy guard. A
 * wrong passcode still unlocks audio -- harmless.
 */
export function unlockBeforeOpenRoom<T>(submit: () => T): T {
  audio.unlock();
  return submit();
}

function onGesture(): void {
  if (audio.state === "locked") audio.unlock();
}

/**
 * Any click or key press on the laptop unlocks audio while it's locked (rule 3), not just the
 * passcode submit -- including "Check TV lag". Capturing so it runs ahead of the target's own
 * handler, though `unlock()` is idempotent and synchronous, so the order never actually matters.
 * Returns a cleanup function.
 */
export function watchForUnlock(): () => void {
  document.addEventListener("pointerdown", onGesture, true);
  document.addEventListener("keydown", onGesture, true);
  return () => {
    document.removeEventListener("pointerdown", onGesture, true);
    document.removeEventListener("keydown", onGesture, true);
  };
}
