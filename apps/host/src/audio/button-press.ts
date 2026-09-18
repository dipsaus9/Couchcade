/**
 * `press` on every laptop button click (docs/architecture/audio.md's token table: "press ...
 * Clicks on laptop buttons"). A global, DOM-class-based listener rather than something added to
 * @couchcade/ui's `CcButton` -- `CcButton` is shared with the phone controller, which stays
 * silent (HOUSE_STYLE "Motion, sound and haptics": "All sound plays on the TV; the phone stays
 * silent"), so the sound can't live inside the shared component.
 */
import { audio } from "@couchcade/audio";

/**
 * True when `target` is, or is inside, a `.cc-button` (`CcButton`'s own root class). Duck-typed on
 * `closest` rather than `instanceof Element` -- there's no DOM in this app's plain-Node test
 * environment (mirrors `../audio/unlock.ts`'s fake-document tests), so a global `Element` class
 * doesn't exist there to check against.
 */
export function isButtonClick(target: EventTarget | null): boolean {
  const element = target as { closest?: (selector: string) => Element | null } | null;
  if (element === null || typeof element.closest !== "function") return false;
  return element.closest(".cc-button") !== null;
}

function onClick(event: Event): void {
  if (isButtonClick(event.target)) audio.play("press");
}

/**
 * Starts listening for clicks on any `CcButton` on the page. A disabled button's native `click`
 * never fires, so a disabled button never presses. Returns the cleanup function.
 */
export function watchButtonPresses(): () => void {
  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}
