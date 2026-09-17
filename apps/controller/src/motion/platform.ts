import { lockPortrait, type OrientationScreen } from "../device/screen.ts";

// Keeping the page in portrait during motion games (docs/architecture/motion.md, owner decision
// 4). iPhones can't lock the page from the browser, so the motion permission screen tells iPhone
// players to turn on Portrait Orientation Lock. On Android the "Tap to enable motion" tap also
// enters fullscreen and locks portrait until the game ends. Every error is ignored: motion
// controllers keep working if the page rotates anyway (flow rule 8).

/** Which phone the page runs on, as far as the motion step cares. */
export type PhonePlatform = "iphone" | "android" | "other";

/** The parts of `navigator` the detection reads. */
export interface PlatformNavigator {
  userAgent: string;
  maxTouchPoints?: number;
}

/**
 * `iphone` for iOS and iPadOS (an iPad asks for "desktop" pages with a Mac user agent, but has
 * touch points), `android` for Android, `other` for everything else.
 */
export function phonePlatform(nav: PlatformNavigator = globalThis.navigator): PhonePlatform {
  const ua = nav.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "iphone";
  if (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1) return "iphone";
  if (/Android/.test(ua)) return "android";
  return "other";
}

/** The parts of `document` fullscreen uses. */
export interface FullscreenDocument {
  readonly fullscreenElement?: Element | null;
  documentElement: { requestFullscreen?(options?: FullscreenOptions): Promise<void> };
  exitFullscreen?(): Promise<void>;
}

/** `ScreenOrientation` with `unlock`, which not every browser has. */
export type UnlockableScreen = OrientationScreen & {
  orientation?: { unlock?(): void };
};

/**
 * On Android: enters fullscreen and then locks portrait. Call it inside the tap, because
 * fullscreen needs one. Does nothing on other phones.
 */
export function enterMotionFullscreen(
  platform: PhonePlatform,
  doc: FullscreenDocument = globalThis.document,
  screen: UnlockableScreen = globalThis.screen as UnlockableScreen,
): void {
  if (platform !== "android") return;
  try {
    const entering = doc.documentElement.requestFullscreen?.({ navigationUI: "hide" });
    entering?.then(() => lockPortrait(screen)).catch(() => {});
  } catch {
    // No fullscreen: ignored.
  }
}

/** Unlocks the orientation and leaves fullscreen, when the page is in it. */
export function exitMotionFullscreen(
  doc: FullscreenDocument = globalThis.document,
  screen: UnlockableScreen = globalThis.screen as UnlockableScreen,
): void {
  if (!doc.fullscreenElement) return;
  try {
    screen.orientation?.unlock?.();
  } catch {
    // Not locked: ignored.
  }
  try {
    doc.exitFullscreen?.().catch(() => {});
  } catch {
    // Already left: ignored.
  }
}
