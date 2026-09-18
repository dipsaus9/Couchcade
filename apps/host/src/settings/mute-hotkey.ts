/**
 * The `M` key (docs/architecture/audio.md "Host settings" rule 3): toggles mute on any TV screen,
 * except while a text field has focus, so typing a passcode with an "m" in it doesn't mute. It's a
 * laptop control like a click, so `watchForUnlock` (`../audio/unlock.ts`) already opens the
 * autoplay lock on the same keydown; this module only owns the mute toggle.
 */
import { toggleMuted } from "./store.ts";

/** A modifier held with `m` is some other shortcut (Cmd+M minimizes the window, and so on). */
export function isMuteHotkey(event: KeyboardEvent): boolean {
  return (
    event.key.toLowerCase() === "m" &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

/** True while typing would land in `active`, so `M` types a letter instead of muting. */
export function isTextFieldFocused(active: Element | null): boolean {
  if (active === null) return false;
  if ((active as HTMLElement).isContentEditable) return true;
  return active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT";
}

/** Starts listening for the `M` key on `document`. Returns the cleanup function. */
export function watchMuteHotkey(toggle: () => void = toggleMuted): () => void {
  function onKeydown(event: KeyboardEvent): void {
    if (!isMuteHotkey(event)) return;
    if (isTextFieldFocused(document.activeElement)) return;
    toggle();
  }
  document.addEventListener("keydown", onKeydown);
  return () => document.removeEventListener("keydown", onKeydown);
}
