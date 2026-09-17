/** The parts of `navigator` and `document` the screen helpers use, so tests can fake them. */
export interface WakeLockNavigator {
  wakeLock?: {
    request(type: "screen"): Promise<{ readonly released?: boolean; release(): Promise<void> }>;
  };
}
export type VisibilityDocument = Pick<
  Document,
  "visibilityState" | "addEventListener" | "removeEventListener"
>;

/** The one screen wake lock a phone holds while it's in a room. */
export interface ScreenWakeLock {
  /**
   * Asks for the lock again unless it is held. The motion step's "Tap to enable motion" and every
   * "Tap to resume" call it inside their tap (docs/architecture/motion.md, flow rule 5).
   */
  renew(): void;
  /** Releases the lock and stops asking. */
  release(): void;
}

/**
 * Keeps the phone's screen on while the player is in a room: on the menu, during every game and
 * in between (docs/architecture/session-flow.md, decision 9). Browsers release the lock when the
 * page is hidden, so it is requested again whenever the page is visible, and `renew()` asks again
 * from a tap. Every error is ignored: a phone without the Wake Lock API, or one that refuses it,
 * still plays.
 */
export function keepScreenAwake(
  nav: WakeLockNavigator = globalThis.navigator,
  doc: VisibilityDocument = globalThis.document,
): ScreenWakeLock {
  let sentinel: { readonly released?: boolean; release(): Promise<void> } | undefined;
  let requesting = false;
  let stopped = false;

  const request = async (): Promise<void> => {
    if (stopped || requesting || !nav.wakeLock) return;
    // A lock the browser still holds needs no second request. One without `released` is unknown.
    if (sentinel !== undefined && sentinel.released === false) return;
    requesting = true;
    try {
      const lock = await nav.wakeLock.request("screen");
      if (stopped) await lock.release();
      else sentinel = lock;
    } catch {
      // Not allowed right now (battery saver, no user gesture yet): ignored.
    } finally {
      requesting = false;
    }
  };

  const onVisibilityChange = (): void => {
    if (doc.visibilityState === "visible") void request();
  };

  void request();
  doc.addEventListener("visibilitychange", onVisibilityChange);

  return {
    renew: () => void request(),
    release: () => {
      stopped = true;
      doc.removeEventListener("visibilitychange", onVisibilityChange);
      sentinel?.release().catch(() => {});
      sentinel = undefined;
    },
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
