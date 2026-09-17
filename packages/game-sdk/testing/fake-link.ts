/**
 * A fake WebRTC link for tests, from docs/architecture/realtime-link.md, "Testing": "a pair of
 * in-memory channels with the same interface as the browser wiring, driven by fake timers. Used
 * by the unit tests and by component tests of both apps." The real browser wiring
 * (`apps/controller/src/runtime/link.ts`, `apps/host/src/runtime/links.ts`) doesn't exist yet
 * (CC-3.19, CC-3.20); this exposes the minimal `send`/`onMessage` shape both a real
 * `RTCDataChannel` and the link core's own tests need, so later stories can adapt it without
 * changing the tests built on it here.
 */
import type { LinkScheduler } from "../src/link/state-machine.ts";

export interface FakeLinkOptions {
  /** Base one-way delay in ms. Default 0. */
  delayMs?: number;
  /** Extra delay, 0 to `jitterMs`, added uniformly at random to each delivery. Default 0. */
  jitterMs?: number;
  /** Chance, 0 to 1, that a message is dropped instead of delivered. Default 0. */
  loss?: number;
  /** Once this many ms have passed since creation, every further send is dropped. Default: never. */
  dropAfterMs?: number;
  /** The local clock in ms. Defaults to `Date.now()`. */
  now?: () => number;
  /** Defaults to `setTimeout`/`clearTimeout`. Pass fake timers to run deliveries deterministically. */
  schedule?: LinkScheduler;
  /** Source of randomness, 0 to 1, for jitter and loss. Defaults to `Math.random`. */
  random?: () => number;
}

export interface FakeLinkSide {
  /** Queues `data` for delivery to the other side, subject to loss, delay, jitter and cut-off. */
  send(data: string): void;
  /** Subscribes to messages delivered from the other side. Returns an unsubscribe function. */
  onMessage(handler: (data: string) => void): () => void;
  /** Always 0: this fake never buffers. Present so callers can read it like a real data channel. */
  readonly bufferedAmount: number;
}

export interface FakeLink {
  readonly a: FakeLinkSide;
  readonly b: FakeLinkSide;
  /** Stops delivering and cancels every pending delivery. */
  close(): void;
}

const defaultSchedule: LinkScheduler = (callback, delayMs) => {
  const handle = setTimeout(callback, delayMs);
  return () => clearTimeout(handle);
};

/** A pair of in-memory duplex channels standing in for a WebRTC link's data channels in tests. */
export function createFakeLink(options: FakeLinkOptions = {}): FakeLink {
  const delayMs = options.delayMs ?? 0;
  const jitterMs = options.jitterMs ?? 0;
  const loss = options.loss ?? 0;
  const dropAfterMs = options.dropAfterMs ?? Number.POSITIVE_INFINITY;
  const now = options.now ?? (() => Date.now());
  const schedule = options.schedule ?? defaultSchedule;
  const random = options.random ?? Math.random;

  const startMs = now();
  let closed = false;
  const cancels = new Set<() => void>();
  let listenersA: Array<(data: string) => void> = [];
  let listenersB: Array<(data: string) => void> = [];

  function deliverTo(listeners: () => Array<(data: string) => void>, data: string): void {
    if (closed || now() - startMs >= dropAfterMs) return;
    if (loss > 0 && random() < loss) return;
    const jitter = jitterMs > 0 ? random() * jitterMs : 0;
    const delay = Math.max(0, delayMs + jitter);
    const cancel = schedule(() => {
      cancels.delete(cancel);
      if (!closed) for (const listener of listeners()) listener(data);
    }, delay);
    cancels.add(cancel);
  }

  function makeSide(
    getOwn: () => Array<(data: string) => void>,
    setOwn: (next: Array<(data: string) => void>) => void,
    getOther: () => Array<(data: string) => void>,
  ): FakeLinkSide {
    return {
      send(data) {
        deliverTo(getOther, data);
      },
      onMessage(handler) {
        setOwn([...getOwn(), handler]);
        return () => setOwn(getOwn().filter((existing) => existing !== handler));
      },
      get bufferedAmount() {
        return 0;
      },
    };
  }

  return {
    a: makeSide(
      () => listenersA,
      (next) => (listenersA = next),
      () => listenersB,
    ),
    b: makeSide(
      () => listenersB,
      (next) => (listenersB = next),
      () => listenersA,
    ),
    close() {
      closed = true;
      for (const cancel of cancels) cancel();
      cancels.clear();
    },
  };
}
