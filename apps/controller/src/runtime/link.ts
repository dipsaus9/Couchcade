/**
 * The phone's WebRTC link to the host: browser wiring around `@couchcade/game-sdk/link`'s pure
 * pieces (docs/architecture/realtime-link.md, "Game SDK API sketch" > "Where the code lives").
 * `createControllerLink` owns one `RTCPeerConnection` and its two negotiated data channels, drives
 * `createLinkStateMachine` from the connection's real events, and hands out one `InputChannel` per
 * running game over `createInputChannel` (`@couchcade/game-sdk/input`).
 *
 * Session-level, not per-game: built once (`session/session.ts`) and followed for the phone's
 * whole time in a room, so the link is up well before a game starts (realtime-link.md, "Join").
 *
 * `RTCPeerConnection`/`RTCDataChannel` are used only through the small structural interfaces below
 * (`LinkPeer`, `LinkChannel`), so a test can inject a fake pair (built on `createFakeLink`) without
 * a real WebRTC stack, the same way `state-machine.ts` takes an injectable clock and scheduler.
 */
import { toHostTime as roomToHostTime } from "@couchcade/game-sdk/clock";
import type { GameInput, InputChannel, InputChannelPath } from "@couchcade/game-sdk/contract";
import {
  createInputChannel,
  type InputChannelCountedSend,
  type InputChannelStreamSend,
} from "@couchcade/game-sdk/input";
import {
  createLinkStateMachine,
  decodeDescription,
  encodeDescription,
  frameBytesOf,
  linkClockSampleOf,
  maxFrameBytes as linkFrameByteCap,
  type LinkScheduler,
  type LinkState,
} from "@couchcade/game-sdk/link";
import {
  encode,
  linkPong,
  type JsonValue,
  type LinkDescription,
  type PhoneToRelayMessage,
  type RelayToPhoneMessage,
} from "@couchcade/protocol";
import type { PhoneState } from "../session/state.ts";
import { localToRoomTime, type LocalClock } from "./send.ts";
import { realtimeLinkEnabled } from "./link-switch.ts";

/** `rtc:answer` as the phone receives it (relay-to-phone shape, `to` already stripped). */
export type RtcAnswerPayload = Extract<RelayToPhoneMessage, { t: "rtc:answer" }>["d"];

/** A stream value is skipped while `cc-stream`'s `bufferedAmount` is over this (realtime-link.md,
 * "Rates"). The next sample, a moment later, carries a newer value anyway. */
const streamCongestionBytes = 4_096;
/** Ping cadence while `connecting`, to reach the 3 pongs that promote to `direct` quickly. */
const connectingPingIntervalMs = 50;
/** Ping cadence once up, outside a real-time game's `playing` phase (Channels, messages and rates). */
const idlePingIntervalMs = 1_000;
/** Ping cadence once up, during a real-time game's `playing` phase. */
const playingPingIntervalMs = 250;
/** Most round-trip samples the dev readout keeps, for a running median (Clock, "What we measure"). */
const rttSampleWindow = 20;
/** How long ICE gathering may take before the offer goes out with whatever candidates arrived
 * (Signalling, "gather local candidates, at most 1,000 ms"). */
const iceGatherTimeoutMs = 1_000;

/** The minimal `RTCDataChannel` surface the link uses. */
export interface LinkChannel {
  readonly readyState: "connecting" | "open" | "closing" | "closed" | string;
  readonly bufferedAmount: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
}

/** The minimal `RTCPeerConnection` surface the link uses. */
export interface LinkPeer {
  readonly connectionState: string;
  readonly iceGatheringState: string;
  readonly localDescription: { readonly sdp: string } | null;
  onconnectionstatechange: (() => void) | null;
  onicegatheringstatechange: (() => void) | null;
  createDataChannel(
    label: string,
    options: { negotiated: true; id: number; ordered?: boolean; maxRetransmits?: number },
  ): LinkChannel;
  createOffer(): Promise<{ sdp?: string }>;
  setLocalDescription(description: { type: "offer"; sdp: string }): Promise<void>;
  setRemoteDescription(description: { type: "answer"; sdp: string }): Promise<void>;
  close(): void;
}

export interface ControllerLinkOptions {
  /** Sends one message over the room's relay socket, for `rtc:offer` and the relay input path. */
  sendMessage(message: PhoneToRelayMessage): void;
  /** Whether the switch is on for this page load. Defaults to `realtimeLinkEnabled()`. */
  enabled?: () => boolean;
  /** True when this browser could ever open a link. Defaults to checking for `RTCPeerConnection`. */
  supportsLink?: () => boolean;
  /** Builds the peer connection. Defaults to a real `RTCPeerConnection` with `iceServers: []`. */
  createPeer?: () => LinkPeer | null;
  /** The local clock the link's own timestamps use. Defaults to `performance`. */
  clock?: LocalClock;
  /** Converts a local (`clock`) timestamp to room time. Defaults to the shared room clock. */
  toHostTime?: (localTimestamp: number) => number;
  /** Defaults to `setTimeout`/`clearTimeout`. */
  schedule?: LinkScheduler;
  /** True while the page is visible. Defaults to `document.visibilityState !== "hidden"`. */
  isPageVisible?: () => boolean;
  /** Subscribes to visibility changes. Defaults to `document`'s `visibilitychange` event. */
  onVisibilityChange?: (listener: () => void) => () => void;
  /** Dev warnings, such as a dropped oversized frame. Defaults to `console.warn`. */
  warn?: (message: string) => void;
}

export interface ControllerLink {
  /** The link's own lifecycle state, for the dev readout. */
  readonly state: LinkState;
  /** Which path real-time input takes right now: what every `InputChannel` this link hands out
   * reports as its `path` (for dev readouts and tests; games never branch on it). */
  readonly path: InputChannelPath;
  /** The link's round trip, a running median of the last pongs, or null before the first one. */
  readonly rttMs: number | null;
  onChange(listener: (state: LinkState) => void): () => void;
  /** Called with every `PhoneState`; starts, keeps or stops the link to match it. */
  follow(state: PhoneState): void;
  /** Wires an `rtc:answer` the phone received. Ignored if it isn't for the current attempt. */
  receiveAnswer(payload: RtcAnswerPayload): void;
  /** Switches the ping cadence: 250 ms during a real-time game's `playing` phase, 1,000 ms
   * otherwise (Channels, messages and rates). */
  setPlaying(playing: boolean): void;
  /** Builds one running game's `InputChannel` over this link (Game SDK API sketch). */
  createChannel<TInput extends GameInput>(
    streams?: Readonly<Record<string, { hz?: 30 | 60 }>>,
  ): InputChannel<TInput>;
  dispose(): void;
}

interface PeerAttempt {
  readonly id: number;
  readonly pc: LinkPeer;
  readonly streamChannel: LinkChannel;
  readonly eventsChannel: LinkChannel;
}

interface TimerGlobals {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  console: { warn(message: string): void };
  RTCPeerConnection?: new (config: unknown) => LinkPeer;
  document?: {
    visibilityState?: string;
    addEventListener(type: "visibilitychange", listener: () => void): void;
    removeEventListener(type: "visibilitychange", listener: () => void): void;
  };
}

// The lib tsconfig has no DOM types. Browsers provide all of these; tests inject fakes instead.
const globals = globalThis as unknown as TimerGlobals;

const defaultSchedule: LinkScheduler = (callback, delayMs) => {
  const handle = globals.setTimeout(callback, delayMs);
  return () => globals.clearTimeout(handle);
};

function defaultSupportsLink(): boolean {
  return typeof globals.RTCPeerConnection === "function";
}

function defaultCreatePeer(): LinkPeer | null {
  const ctor = globals.RTCPeerConnection;
  if (typeof ctor !== "function") return null;
  // No STUN, no TURN (owner answers 1 and 2): only local host candidates ever gather.
  return new ctor({
    iceServers: [],
    iceTransportPolicy: "all",
    bundlePolicy: "max-bundle",
    iceCandidatePoolSize: 0,
  });
}

function defaultIsPageVisible(): boolean {
  return globals.document?.visibilityState !== "hidden";
}

function defaultOnVisibilityChange(listener: () => void): () => void {
  const doc = globals.document;
  if (doc === undefined) return () => {};
  doc.addEventListener("visibilitychange", listener);
  return () => doc.removeEventListener("visibilitychange", listener);
}

function seatedAndHostConnected(state: PhoneState): boolean {
  return state.status === "room" && state.role === "player" && state.online && state.hostConnected;
}

function randomAttemptId(): number {
  return Math.floor(Math.random() * 0x1_0000_0000);
}

function median(samples: readonly number[]): number | null {
  if (samples.length === 0) return null;
  const sorted = samples.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
    : (sorted[mid] as number);
}

/** Waits for ICE gathering to finish, at most `iceGatherTimeoutMs`, then returns the local SDP
 * (Signalling, "gather local candidates, at most 1,000 ms; not trickled"). */
async function gatherAndOffer(pc: LinkPeer, schedule: LinkScheduler): Promise<string> {
  const offer = await pc.createOffer();
  await pc.setLocalDescription({ type: "offer", sdp: offer.sdp ?? "" });
  if (pc.iceGatheringState !== "complete") {
    await new Promise<void>((resolve) => {
      let cancelTimeout: (() => void) | null = schedule(() => {
        cancelTimeout = null;
        pc.onicegatheringstatechange = null;
        resolve();
      }, iceGatherTimeoutMs);
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState !== "complete") return;
        cancelTimeout?.();
        cancelTimeout = null;
        pc.onicegatheringstatechange = null;
        resolve();
      };
    });
  }
  return pc.localDescription?.sdp ?? offer.sdp ?? "";
}

/** Builds one phone's WebRTC link. Follow it with every `PhoneState` change and every `rtc:answer`
 * the phone receives; hand its `createChannel` result to each running game as `input`. */
export function createControllerLink(options: ControllerLinkOptions): ControllerLink {
  const clock: LocalClock = options.clock ?? globalThis.performance;
  const toHostTime = options.toHostTime ?? roomToHostTime;
  const schedule = options.schedule ?? defaultSchedule;
  const warn = options.warn ?? ((message: string) => globals.console.warn(message));
  const enabled = options.enabled ?? realtimeLinkEnabled;
  const supportsLink = options.supportsLink ?? defaultSupportsLink;
  const createPeer = options.createPeer ?? defaultCreatePeer;
  const isPageVisible = options.isPageVisible ?? defaultIsPageVisible;

  const machine = createLinkStateMachine({ now: () => clock.now(), schedule });

  let sessionActive = false;
  let pageVisible = isPageVisible();
  /** The last game id `follow` saw, to detect "a new game starts" (Connection lifecycle's third
   * named retry trigger, alongside the page becoming visible and the socket or TV coming back). */
  let lastGameId: string | null = null;
  let peerAttempt: PeerAttempt | null = null;
  let pingCancel: (() => void) | null = null;
  let pingSeq = 0;
  let pingIntervalMs = idlePingIntervalMs;
  let rttSamples: number[] = [];
  const pathListeners = new Set<(path: InputChannelPath) => void>();

  const linkAllowed = (): boolean => enabled() && supportsLink();

  function currentPath(): InputChannelPath {
    if (!sessionActive || !pageVisible) return "off";
    if (!linkAllowed()) return "relay";
    return machine.state === "direct" ? "direct" : "relay";
  }

  let lastNotifiedPath = currentPath();
  function notifyPathChange(): void {
    const next = currentPath();
    if (next === lastNotifiedPath) return;
    lastNotifiedPath = next;
    for (const listener of pathListeners) listener(next);
  }

  function stopPingLoop(): void {
    pingCancel?.();
    pingCancel = null;
  }

  function sendPingNow(): void {
    if (peerAttempt !== null && peerAttempt.streamChannel.readyState === "open") {
      const t0 = clock.now();
      peerAttempt.streamChannel.send(JSON.stringify({ t: "link:ping", d: { id: pingSeq, t0 } }));
      pingSeq += 1;
    }
    const interval = machine.state === "connecting" ? connectingPingIntervalMs : pingIntervalMs;
    pingCancel = schedule(() => {
      pingCancel = null;
      sendPingNow();
    }, interval);
  }

  function startPingLoop(): void {
    stopPingLoop();
    sendPingNow();
  }

  function handleStreamMessage(data: unknown): void {
    if (typeof data !== "string") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    const result = linkPong.safeParse(parsed);
    if (!result.success) return;
    const { t0, t1, t2 } = result.data.d;
    const t3 = clock.now();
    const sample = linkClockSampleOf({ t0, t1, t2, t3 });
    rttSamples = [...rttSamples, sample.rttMs].slice(-rttSampleWindow);
    machine.pong();
  }

  function teardownPeer(): void {
    stopPingLoop();
    if (peerAttempt === null) return;
    const { pc, streamChannel, eventsChannel } = peerAttempt;
    streamChannel.onopen = null;
    streamChannel.onclose = null;
    streamChannel.onmessage = null;
    eventsChannel.onopen = null;
    eventsChannel.onclose = null;
    eventsChannel.onmessage = null;
    pc.onconnectionstatechange = null;
    pc.onicegatheringstatechange = null;
    try {
      streamChannel.close();
    } catch {
      // Already closing: nothing to do.
    }
    try {
      eventsChannel.close();
    } catch {
      // Already closing: nothing to do.
    }
    try {
      pc.close();
    } catch {
      // Already closed.
    }
    peerAttempt = null;
  }

  function startAttempt(): void {
    teardownPeer();
    const pc = createPeer();
    if (pc === null) {
      // Feature-detected as unsupported after all: fall back at once, no 5 s wait (AC2).
      machine.descriptionRefused();
      return;
    }
    const attemptId = randomAttemptId();
    const streamChannel = pc.createDataChannel("cc-stream", {
      negotiated: true,
      id: 0,
      ordered: false,
      maxRetransmits: 0,
    });
    const eventsChannel = pc.createDataChannel("cc-events", { negotiated: true, id: 1 });

    let streamOpen = false;
    let eventsOpen = false;
    const maybeChannelsOpen = (): void => {
      if (streamOpen && eventsOpen) {
        machine.channelsOpen();
        startPingLoop();
      }
    };
    streamChannel.onopen = () => {
      streamOpen = true;
      maybeChannelsOpen();
    };
    eventsChannel.onopen = () => {
      eventsOpen = true;
      maybeChannelsOpen();
    };
    streamChannel.onclose = () => machine.connectionClosed();
    eventsChannel.onclose = () => machine.connectionClosed();
    streamChannel.onmessage = (event) => handleStreamMessage(event.data);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        machine.connectionClosed();
      }
    };

    peerAttempt = { id: attemptId, pc, streamChannel, eventsChannel };

    gatherAndOffer(pc, schedule).then(
      (sdp) => {
        if (peerAttempt?.pc !== pc) return; // superseded by a newer attempt or torn down
        let desc: ReturnType<typeof encodeDescription>;
        try {
          desc = encodeDescription(sdp);
        } catch {
          machine.descriptionRefused();
          return;
        }
        if (frameBytesOf(desc) > linkFrameByteCap) {
          warn("link: offer description does not fit the 1 KB frame cap, using the relay path");
          machine.descriptionRefused();
          return;
        }
        // `encodeDescription`'s result is structurally the wire shape; only its readonly-ness
        // differs from the protocol schema's inferred (mutable) type.
        options.sendMessage({
          t: "rtc:offer",
          d: { s: attemptId, desc: desc as unknown as LinkDescription },
        });
      },
      () => {
        if (peerAttempt?.pc === pc) machine.descriptionRefused();
      },
    );
  }

  // Whether the last `recomputeUp` found the link wanted up, so `retry()` fires only on a real
  // trigger (page visible again, the socket or the TV coming back, a new game starting -- the
  // Connection lifecycle's named retry triggers), not on every later `follow()` while still on
  // the relay path. Without this edge check, ordinary room traffic would call `retry()` on every
  // dispatch, cancelling the state machine's own backoff timer each time and burning the hourly
  // attempt budget on nothing (Connection lifecycle, "Retry limits").
  let wasUp = false;

  function recomputeUp(trigger = false): void {
    const wantsUp = pageVisible && linkAllowed() && sessionActive;
    if (!wantsUp) {
      machine.stop();
    } else if (machine.state === "off") {
      machine.start();
    } else if (machine.state === "relay" && (!wasUp || trigger)) {
      machine.retry();
    }
    wasUp = wantsUp;
    notifyPathChange();
  }

  machine.onChange((next) => {
    notifyPathChange();
    if (next === "connecting") startAttempt();
    else if (next === "off" || next === "relay") teardownPeer();
  });

  const unsubscribeVisibility = (options.onVisibilityChange ?? defaultOnVisibilityChange)(() => {
    pageVisible = isPageVisible();
    // A hidden page closes its link at once (AC5); coming back visible re-offers through
    // `recomputeUp` with a fresh attempt id, once `follow` has seen `room:welcome` again.
    recomputeUp();
  });

  function buildInputPayload(
    input: GameInput,
    atMs: number,
    extra: { n: number } | { e: number },
  ): { type: string; payload?: GameInput["payload"]; at: number } & (
    | { n: number }
    | { e: number }
  ) {
    const at = localToRoomTime(atMs, toHostTime, clock);
    return input.payload === undefined
      ? { type: input.type, at, ...extra }
      : { type: input.type, payload: input.payload, at, ...extra };
  }

  function sendOverChannel(channel: LinkChannel, message: PhoneToRelayMessage): void {
    if (channel.readyState !== "open") return;
    let frame: string;
    try {
      frame = encode(message);
    } catch {
      warn(`link: dropped an oversized ${message.t} frame`);
      return;
    }
    channel.send(frame);
  }

  const sendDirectStream: InputChannelCountedSend<GameInput> = (input, atMs, n) => {
    if (peerAttempt === null) return;
    const { streamChannel } = peerAttempt;
    // Congestion: skip while buffered, the next sample a moment later covers it (Rates).
    if (streamChannel.bufferedAmount > streamCongestionBytes) return;
    sendOverChannel(streamChannel, { t: "input", d: buildInputPayload(input, atMs, { n }) });
  };

  const sendDirectEvent: InputChannelCountedSend<GameInput> = (input, atMs, e) => {
    if (peerAttempt === null) return;
    sendOverChannel(peerAttempt.eventsChannel, {
      t: "input",
      d: buildInputPayload(input, atMs, { e }),
    });
  };

  const sendRelayStream: InputChannelStreamSend<GameInput> = (input, atMs, more) => {
    const at = localToRoomTime(atMs, toHostTime, clock);
    // Protocol's `more` tuples are JSON, so an absent payload travels as `null`, same as any
    // other value JSON has no `undefined` for.
    const moreEntries: Array<[number, JsonValue]> = more.map(([dtMs, payload]) => [
      dtMs,
      payload ?? null,
    ]);
    options.sendMessage({
      t: "input",
      d:
        input.payload === undefined
          ? { type: input.type, at, more: moreEntries }
          : { type: input.type, payload: input.payload, at, more: moreEntries },
    });
  };

  const sendRelayEvent: InputChannelCountedSend<GameInput> = (input, atMs, e) => {
    const at = localToRoomTime(atMs, toHostTime, clock);
    options.sendMessage({
      t: "input",
      d:
        input.payload === undefined
          ? { type: input.type, at, e }
          : { type: input.type, payload: input.payload, at, e },
    });
  };

  return {
    get state() {
      return machine.state;
    },
    get path() {
      return currentPath();
    },
    get rttMs() {
      return median(rttSamples);
    },

    onChange: machine.onChange,

    follow(state) {
      sessionActive = seatedAndHostConnected(state);
      const gameId = state.status === "room" ? state.gameId : null;
      const newGameStarted = gameId !== null && gameId !== lastGameId;
      lastGameId = gameId;
      recomputeUp(newGameStarted);
    },

    receiveAnswer(payload) {
      if (peerAttempt === null || payload.s !== peerAttempt.id) return; // stale or unknown attempt
      const pc = peerAttempt.pc;
      let decoded: { type: "offer" | "answer"; sdp: string };
      try {
        decoded = decodeDescription(payload.desc, "answer");
      } catch {
        machine.descriptionRefused();
        return;
      }
      pc.setRemoteDescription({ type: "answer", sdp: decoded.sdp }).catch(() => {
        if (peerAttempt?.pc === pc) machine.connectionClosed();
      });
    },

    setPlaying(playing) {
      pingIntervalMs = playing ? playingPingIntervalMs : idlePingIntervalMs;
      machine.setPingIntervalMs(pingIntervalMs);
    },

    createChannel<TInput extends GameInput>(
      streams?: Readonly<Record<string, { hz?: 30 | 60 }>>,
    ): InputChannel<TInput> {
      return createInputChannel<TInput>({
        streams,
        path: currentPath,
        onPathChange: (listener) => {
          pathListeners.add(listener);
          return () => pathListeners.delete(listener);
        },
        sendDirectStream,
        sendDirectEvent,
        sendRelayStream,
        sendRelayEvent,
        now: () => clock.now(),
        schedule,
        warn,
      });
    },

    dispose() {
      teardownPeer();
      unsubscribeVisibility();
      machine.stop();
    },
  };
}
