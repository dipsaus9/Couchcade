/**
 * Whether the phone itself has a network at all, from the browser's own signal
 * (`navigator.onLine` plus the `online`/`offline` window events). This is a different question
 * from the room socket being open (runtime/reconnect.ts, "Connection lost"): a phone can be
 * online but still mid-reconnect to the relay, and a phone that's offline can't reach anything,
 * including the join API.
 */

/** The part of `Window`/`navigator` this needs, so tests can pass a fake. */
export interface NetworkSource {
  onLine: boolean;
  addEventListener(type: "online" | "offline", listener: () => void): void;
  removeEventListener(type: "online" | "offline", listener: () => void): void;
}

export interface NetworkWatch {
  /** True while the browser reports no network. */
  isOffline(): boolean;
  dispose(): void;
}

/** Reads `navigator.onLine`, or true (online) outside a browser, so tests without one don't trip. */
function currentlyOnline(source: NetworkSource | null): boolean {
  return source?.onLine ?? true;
}

/** `navigator.onLine` plus `window`'s `online`/`offline` events (the events fire on `window`, not `navigator`). */
function defaultSource(): NetworkSource | null {
  if (typeof window === "undefined" || typeof navigator === "undefined") return null;
  return {
    get onLine() {
      return navigator.onLine;
    },
    addEventListener: (type, listener) => window.addEventListener(type, listener),
    removeEventListener: (type, listener) => window.removeEventListener(type, listener),
  };
}

/**
 * Watches the browser's online/offline signal and calls `onChange` whenever it flips.
 * `source` defaults to `window`/`navigator` combined; pass a fake in tests.
 */
export function watchNetwork(
  onChange: (offline: boolean) => void,
  source: NetworkSource | null = defaultSource(),
): NetworkWatch {
  let offline = !currentlyOnline(source);

  const onOnline = (): void => {
    offline = false;
    onChange(false);
  };
  const onOffline = (): void => {
    offline = true;
    onChange(true);
  };

  source?.addEventListener("online", onOnline);
  source?.addEventListener("offline", onOffline);

  return {
    isOffline: () => offline,
    dispose() {
      source?.removeEventListener("online", onOnline);
      source?.removeEventListener("offline", onOffline);
    },
  };
}
