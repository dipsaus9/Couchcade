/**
 * The host's WebRTC link to every seated phone: browser wiring around `@couchcade/game-sdk/link`'s
 * pure pieces, answer-side (docs/architecture/realtime-link.md, "Game SDK API sketch" > "Where the
 * code lives", and "Signalling"). The host never starts a connection and runs no timers: it answers
 * an `rtc:offer` from a seated player, applies the TV-side limits to every frame that arrives, and
 * unpacks relay samples the same shape `apps/host/src/runtime/game-runner.ts` expects either way.
 *
 * `RTCPeerConnection`/`RTCDataChannel` are used only through the small structural interfaces below
 * (`HostLinkPeer`, `HostLinkChannel`), so a test can inject a fake pair without a real WebRTC stack,
 * the same pattern `apps/controller/src/runtime/link.ts` (CC-3.19) uses.
 */
import {
  createLinkGuard,
  cutoffDropThreshold,
  cutoffWindowMs,
  decodeDescription,
  encodeDescription,
  frameBytesOf,
  maxFrameBytes as linkFrameByteCap,
  type LinkChannel as LinkGuardChannel,
  type LinkGuard,
  type LinkScheduler,
} from "@couchcade/game-sdk/link";
import {
  inputPayloadSchema,
  linkPing,
  maxFrameBytes,
  utf8ByteLength,
  type HostToRelayMessage,
  type LinkDescription,
  type PayloadOf,
} from "@couchcade/protocol";
import * as z from "zod/mini";
import type { InputPayload } from "./game-runner.ts";
import { realtimeLinkEnabled } from "./link-switch.ts";

/** `rtc:offer` as the host receives it, `from` already read off the envelope. */
export type RtcOfferPayload = PayloadOf<"rtc:offer">;

/** A phone offers again within this long: ignored, the older link (if any) stays up (AC1). */
const ignoreDuplicateOfferMs = 5_000;
/** More than `cutoffDropThreshold` drops in `cutoffWindowMs`: the link closes and offers from that
 * player are ignored for this long (AC3, "TV-side limits on the link"). */
const cutoffIgnoreMs = 60_000;
/** How long ICE gathering may take before the answer goes out with whatever candidates arrived,
 * symmetric with the phone's own offer (Signalling, "gather local candidates, at most 1,000 ms"). */
const iceGatherTimeoutMs = 1_000;
/** The relay path's playback delay starting point (Fallback detection and smoothing). */
const relayPlaybackDelayMs = 180;
/** Direct-path playback delay bounds, `D = clamp(1000 / hz + 2 * jitter, 25, 120)` (Smoothing on
 * the direct path). The host doesn't yet learn a phone's measured jitter -- link:ping/pong only
 * gives the host `t0`, `t1` and `t2`, never `t3`, so only the phone can compute a true round trip
 * (Clock and latency measurement). Until a later story reports it to the host, this assumes zero
 * jitter at the default 30 Hz stream rate, which the doc's own numbers put close to the observed
 * range ("about 40 to 50 ms" on a quiet Wi-Fi). `rttMs` stays null until then. */
function directPlaybackDelayMs(jitterMs: number, hz: 30 | 60 = 30): number {
  return Math.min(120, Math.max(25, 1000 / hz + 2 * jitterMs));
}

/** One in-game player's real-time input path, for `HostSceneData.link` (AC7). */
export interface HostLinkInfo {
  path: "direct" | "relay";
  rttMs: number | null;
  playbackDelayMs: number;
}

/** The minimal `RTCDataChannel` surface the host link uses. */
export interface HostLinkChannel {
  readonly readyState: "connecting" | "open" | "closing" | "closed" | string;
  readonly bufferedAmount: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
}

/** The minimal `RTCPeerConnection` surface the host link uses, answer-side. */
export interface HostLinkPeer {
  readonly connectionState: string;
  readonly iceGatheringState: string;
  readonly localDescription: { readonly sdp: string } | null;
  onconnectionstatechange: (() => void) | null;
  onicegatheringstatechange: (() => void) | null;
  createDataChannel(
    label: string,
    options: { negotiated: true; id: number; ordered?: boolean; maxRetransmits?: number },
  ): HostLinkChannel;
  setRemoteDescription(description: { type: "offer"; sdp: string }): Promise<void>;
  createAnswer(): Promise<{ sdp?: string }>;
  setLocalDescription(description: { type: "answer"; sdp: string }): Promise<void>;
  close(): void;
}

export interface HostLinksOptions {
  /** Sends `rtc:answer` over the relay. */
  sendMessage(message: HostToRelayMessage): void;
  /** True when `id` currently holds a seat in this room (AC1: "only from seated players"). */
  isSeatedPlayer(id: string): boolean;
  /** Whether the link switch is on for this TV session (`link-switch.ts`). Defaults to
   * `realtimeLinkEnabled`. With the switch off, every offer is ignored, whatever a phone's own
   * switch says (Rollout step 5, "Both apps wire the link behind a switch"). */
  enabled?: () => boolean;
  /** Queues one applied input for the running game, in the same shape either path produces. */
  onInput(playerId: string, input: InputPayload): void;
  /** Builds the answer-side peer connection. Defaults to a real `RTCPeerConnection` with
   * `iceServers: []`. Returns null when this browser can't build one. */
  createPeer?: () => HostLinkPeer | null;
  /** The local clock in milliseconds, on the room clock's local timeline. Defaults to `performance`. */
  now?: () => number;
  /** The host's own room clock offset, for `link:pong`'s `r` (Refining a phone's clock, rule 3). */
  roomOffsetMs?: () => number;
  /** Defaults to `setTimeout`/`clearTimeout`. Only used to bound ICE gathering. */
  schedule?: LinkScheduler;
  /** Dev warnings, such as a dropped oversized frame. Defaults to `console.warn`. */
  warn?: (message: string) => void;
}

export interface HostLinks {
  /** A seated player's phone offered a link: answers it, replacing any older link for them, unless
   * it's a duplicate within 5 s or the player is cut off (AC1, AC3). */
  receiveOffer(from: string, payload: RtcOfferPayload): void;
  /** Closes a player's link right away, if they have one (AC4: kicked, left or expired). */
  close(playerId: string): void;
  /** Closes every link (AC4: `room:end`, and general teardown). */
  closeAll(): void;
  /** The path, round trip and playback delay to draw `playerId`'s streams at (AC7). Always
   * returns a value: "relay" numbers for a player with no open link. */
  link(playerId: string): HostLinkInfo;
}

interface PeerLink {
  readonly pc: HostLinkPeer;
  readonly streamChannel: HostLinkChannel;
  readonly eventsChannel: HostLinkChannel;
  readonly guard: LinkGuard;
  streamOpen: boolean;
  eventsOpen: boolean;
  /** The highest direct-stream `n` applied yet, so a message an unordered channel redelivered or
   * reordered under one already applied is dropped without counting against the cutoff (Link
   * messages: "the host drops a stream message older than one it already applied"). */
  lastAppliedN: number;
  /** Drop timestamps in the last `cutoffWindowMs`, across every reason a frame is dropped (rate
   * limit, oversized, binary, bad JSON, failed schema, a `from` field): "TV-side limits", "Dropped
   * frames". */
  drops: number[];
}

interface TimerGlobals {
  performance: { timeOrigin: number; now(): number };
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  console: { warn(message: string): void };
  RTCPeerConnection?: new (config: unknown) => HostLinkPeer;
}

// The lib tsconfig has no DOM types. Browsers provide all of these; tests inject fakes instead.
const globals = globalThis as unknown as TimerGlobals;

const defaultSchedule: LinkScheduler = (callback, delayMs) => {
  const handle = globals.setTimeout(callback, delayMs);
  return () => globals.clearTimeout(handle);
};

function defaultNow(): number {
  return globals.performance.timeOrigin + globals.performance.now();
}

function defaultCreatePeer(): HostLinkPeer | null {
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

/** A link frame on `cc-stream`: an `input` sample (with `n`) or a `link:ping`. */
const linkStreamFrameSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("input"), d: inputPayloadSchema }),
  linkPing,
]);
/** A link frame on `cc-events`: always an `input` event (with `e`). */
const linkEventsFrameSchema = z.object({ t: z.literal("input"), d: inputPayloadSchema });

type LinkStreamFrame = z.infer<typeof linkStreamFrameSchema>;
type LinkEventsFrame = z.infer<typeof linkEventsFrameSchema>;

/**
 * Parses one raw data-channel message against `schema`. Drops (returns null) a binary frame, one
 * over the 1 KB cap, invalid JSON, one that fails `schema`, or one that carries `from` -- a link
 * frame has none; the host takes the sender from which link it arrived on (AC2, "Link messages").
 */
function parseLinkFrame<T>(data: unknown, schema: z.ZodMiniType<T>): T | null {
  if (typeof data !== "string") return null;
  if (data.length > maxFrameBytes || utf8ByteLength(data) > maxFrameBytes) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof parsed === "object" && parsed !== null && "from" in parsed) return null;
  const result = schema.safeParse(parsed);
  return result.success ? result.data : null;
}

/** Waits for ICE gathering to finish, at most `iceGatherTimeoutMs`, then returns the local SDP. */
async function gatherAndAnswer(pc: HostLinkPeer, schedule: LinkScheduler): Promise<string> {
  const answer = await pc.createAnswer();
  await pc.setLocalDescription({ type: "answer", sdp: answer.sdp ?? "" });
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
  return pc.localDescription?.sdp ?? answer.sdp ?? "";
}

/** Builds the host's answer-side WebRTC links. One call per room; feed it every `rtc:offer` and
 * `player:left`, and read `link()` from the scene data each frame. */
export function createHostLinks(options: HostLinksOptions): HostLinks {
  const now = options.now ?? defaultNow;
  const warn = options.warn ?? ((message: string) => globals.console.warn(message));
  const createPeer = options.createPeer ?? defaultCreatePeer;
  const schedule = options.schedule ?? defaultSchedule;
  const roomOffsetMs = options.roomOffsetMs ?? (() => 0);
  const enabled = options.enabled ?? realtimeLinkEnabled;

  const links = new Map<string, PeerLink>();
  const lastOfferAtMs = new Map<string, number>();
  const cutoffUntilMs = new Map<string, number>();

  function teardown(link: PeerLink): void {
    const { pc, streamChannel, eventsChannel } = link;
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
  }

  function closeLink(playerId: string): void {
    const link = links.get(playerId);
    if (link === undefined) return;
    links.delete(playerId);
    teardown(link);
  }

  /** Records one dropped frame and cuts the phone off once past the threshold (AC3). */
  function recordDrop(playerId: string, link: PeerLink, atMs: number): void {
    link.drops = [...link.drops, atMs].filter((droppedAt) => droppedAt > atMs - cutoffWindowMs);
    if (link.drops.length > cutoffDropThreshold) {
      cutoffUntilMs.set(playerId, atMs + cutoffIgnoreMs);
      closeLink(playerId);
    }
  }

  function sendRaw(channel: HostLinkChannel, message: unknown): void {
    if (channel.readyState !== "open") return;
    channel.send(JSON.stringify(message));
  }

  function handlePing(link: PeerLink, ping: Extract<LinkStreamFrame, { t: "link:ping" }>): void {
    const t1 = now();
    const r = roomOffsetMs();
    const t2 = now();
    sendRaw(link.streamChannel, {
      t: "link:pong",
      d: { id: ping.d.id, t0: ping.d.t0, t1, t2, r },
    });
  }

  function handleStreamFrame(playerId: string, link: PeerLink, data: unknown): void {
    const atMs = now();
    const frame = parseLinkFrame<LinkStreamFrame>(data, linkStreamFrameSchema);
    if (frame === null) {
      recordDrop(playerId, link, atMs);
      return;
    }
    if (!link.guard.admit("stream", atMs)) {
      recordDrop(playerId, link, atMs);
      return;
    }
    if (frame.t === "link:ping") {
      handlePing(link, frame);
      return;
    }
    const { n } = frame.d;
    if (n !== undefined) {
      if (n <= link.lastAppliedN) return; // stale on this unordered channel, not abuse
      link.lastAppliedN = n;
    }
    options.onInput(playerId, frame.d);
  }

  function handleEventsFrame(playerId: string, link: PeerLink, data: unknown): void {
    const atMs = now();
    const frame = parseLinkFrame<LinkEventsFrame>(data, linkEventsFrameSchema);
    if (frame === null) {
      recordDrop(playerId, link, atMs);
      return;
    }
    if (!link.guard.admit("events", atMs)) {
      recordDrop(playerId, link, atMs);
      return;
    }
    options.onInput(playerId, frame.d);
  }

  return {
    receiveOffer(from, payload) {
      if (!enabled()) return; // the switch is off: never answer, whatever the phone's own switch says
      const atMs = now();
      if (!options.isSeatedPlayer(from)) return;
      const cutoffUntil = cutoffUntilMs.get(from);
      if (cutoffUntil !== undefined) {
        if (atMs < cutoffUntil) return;
        cutoffUntilMs.delete(from);
      }
      const lastOffer = lastOfferAtMs.get(from);
      if (lastOffer !== undefined && atMs - lastOffer < ignoreDuplicateOfferMs) return;
      lastOfferAtMs.set(from, atMs);

      let decoded: { type: "offer" | "answer"; sdp: string };
      try {
        decoded = decodeDescription(payload.desc, "offer");
      } catch {
        return;
      }

      closeLink(from); // "replaces that player's older link" (AC1)
      const pc = createPeer();
      if (pc === null) return;
      const streamChannel = pc.createDataChannel("cc-stream", {
        negotiated: true,
        id: 0,
        ordered: false,
        maxRetransmits: 0,
      });
      const eventsChannel = pc.createDataChannel("cc-events", { negotiated: true, id: 1 });
      const link: PeerLink = {
        pc,
        streamChannel,
        eventsChannel,
        guard: createLinkGuard(),
        streamOpen: false,
        eventsOpen: false,
        lastAppliedN: -1,
        drops: [],
      };
      links.set(from, link);

      streamChannel.onopen = () => {
        link.streamOpen = true;
      };
      eventsChannel.onopen = () => {
        link.eventsOpen = true;
      };
      streamChannel.onclose = () => closeLink(from);
      eventsChannel.onclose = () => closeLink(from);
      streamChannel.onmessage = (event) => handleStreamFrame(from, link, event.data);
      eventsChannel.onmessage = (event) => handleEventsFrame(from, link, event.data);
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") closeLink(from);
      };

      pc.setRemoteDescription({ type: "offer", sdp: decoded.sdp }).then(
        () =>
          gatherAndAnswer(pc, schedule).then(
            (sdp) => {
              if (links.get(from) !== link) return; // superseded or closed meanwhile
              let desc: ReturnType<typeof encodeDescription>;
              try {
                desc = encodeDescription(sdp);
              } catch {
                closeLink(from);
                return;
              }
              if (frameBytesOf(desc) > linkFrameByteCap) {
                warn("host link: answer description does not fit the 1 KB frame cap");
                closeLink(from);
                return;
              }
              options.sendMessage({
                t: "rtc:answer",
                d: { to: from, s: payload.s, desc: desc as unknown as LinkDescription },
              });
            },
            () => {
              if (links.get(from) === link) closeLink(from);
            },
          ),
        () => {
          if (links.get(from) === link) closeLink(from);
        },
      );
    },

    close(playerId) {
      closeLink(playerId);
    },

    closeAll() {
      // Safe to delete the current key mid-iteration: a Map iterator still visits every entry
      // that existed when iteration started (MDN, `Map.prototype.forEach`'s iteration guarantee).
      for (const playerId of links.keys()) closeLink(playerId);
    },

    link(playerId) {
      const link = links.get(playerId);
      if (link === undefined || !link.streamOpen || !link.eventsOpen) {
        return { path: "relay", rttMs: null, playbackDelayMs: relayPlaybackDelayMs };
      }
      return { path: "direct", rttMs: null, playbackDelayMs: directPlaybackDelayMs(0) };
    },
  };
}

// Re-exported so callers only need one import for the guard-channel label type.
export type { LinkGuardChannel as HostLinkGuardChannel };
