/** The parts of `navigator` and `document` the screen helpers use, so tests can fake them. */
export interface WakeLockNavigator {
  wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> };
}
export type VisibilityDocument = Pick<
  Document,
  "visibilityState" | "addEventListener" | "removeEventListener"
>;

/**
 * Keeps the phone's screen on while the player is in a room. Browsers release the lock when the
 * page is hidden, so it is requested again whenever the page is visible. Every error is ignored:
 * a phone without the Wake Lock API, or one that refuses it, still plays.
 * Returns a function that releases the lock and stops asking.
 */
export function keepScreenAwake(
  nav: WakeLockNavigator = globalThis.navigator,
  doc: VisibilityDocument = globalThis.document,
): () => void {
  let sentinel: { release(): Promise<void> } | undefined;
  let stopped = false;

  const request = async (): Promise<void> => {
    try {
      const lock = await nav.wakeLock?.request("screen");
      if (stopped) await lock?.release();
      else sentinel = lock;
    } catch {
      // Not allowed right now (battery saver, no user gesture yet): ignored.
    }
  };

  const onVisibilityChange = (): void => {
    if (doc.visibilityState === "visible") void request();
  };

  void request();
  doc.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    stopped = true;
    doc.removeEventListener("visibilitychange", onVisibilityChange);
    sentinel?.release().catch(() => {});
    sentinel = undefined;
  };
}

/** `ScreenOrientation.lock` isn't in every browser or in the DOM types. */
export interface OrientationScreen {
  orientation?: { lock?(orientation: "portrait"): Promise<void> };
}

/**
 * Asks the browser to hold portrait. Most phones only allow it in fullscreen or an installed app,
 * so errors are ignored and the layout's rotate notice covers the rest.
 */
export function lockPortrait(
  screen: OrientationScreen = globalThis.screen as OrientationScreen,
): void {
  try {
    screen.orientation?.lock?.("portrait").catch(() => {});
  } catch {
    // Not supported: ignored.
  }
}
