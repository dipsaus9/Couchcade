import type { GameInput } from "@couchcade/game-sdk/contract";
import type { LinkScheduler } from "@couchcade/game-sdk/link";
import { createFakeLink, type FakeLinkSide } from "@couchcade/game-sdk/testing";
import type { PhoneToRelayMessage, PlayerInfo } from "@couchcade/protocol";
import { describe, expect, it } from "vitest";
import {
  createControllerLink,
  type ControllerLinkOptions,
  type LinkChannel,
  type LinkPeer,
} from "../../src/runtime/link.ts";
import { realtimeLinkEnabled } from "../../src/runtime/link-switch.ts";
import { initialState, reduce, type PhoneState } from "../../src/session/state.ts";

// ---- A fake RTCPeerConnection/RTCDataChannel pair, so the link runtime runs without a real
// WebRTC stack. Message delivery (send/onMessage/bufferedAmount) goes through the SDK's own
// `createFakeLink` (`@couchcade/game-sdk/testing`), the same fake the link core's own tests use;
// this only adds the `readyState`/`onopen`/`onclose` a real `RTCDataChannel` has on top of it. ----

/** Wraps one `createFakeLink` side as the phone's `RTCDataChannel`. Its `.b` side plays the host,
 * available on `FakePeer.hostSide(index)` so a test can answer pings or read what a game sent. */
class FakeChannel implements LinkChannel {
  readyState: "connecting" | "open" | "closed" = "connecting";
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;

  private readonly side: FakeLinkSide;

  constructor(side: FakeLinkSide) {
    this.side = side;
    side.onMessage((data) => this.onmessage?.({ data }));
  }

  get bufferedAmount(): number {
    return this.side.bufferedAmount;
  }

  send(data: string): void {
    if (this.readyState === "open") this.side.send(data);
  }

  open(): void {
    this.readyState = "open";
    this.onopen?.();
  }

  close(): void {
    if (this.readyState === "closed") return;
    this.readyState = "closed";
    this.onclose?.();
  }
}

// A minimal offer whose ufrag, password and fingerprint `encodeDescription` (CC-3.16) can parse,
// with one UDP host candidate. Real enough for the link runtime; the codec itself is CC-3.16's.
function fakeOfferSdp(ufrag: string): string {
  return [
    "v=0",
    "o=- 0 0 IN IP4 127.0.0.1",
    "s=-",
    "t=0 0",
    "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
    "c=IN IP4 0.0.0.0",
    "a=candidate:1 1 udp 2122260223 203.0.113.5 54321 typ host generation 0",
    `a=ice-ufrag:${ufrag}`,
    "a=ice-pwd:abcdefghijklmnopqrstuvwxyz012345",
    `a=fingerprint:sha-256 ${Array.from({ length: 32 }, () => "AA").join(":")}`,
    "a=setup:actpass",
    "a=mid:0",
    "",
  ].join("\r\n");
}

class FakePeer implements LinkPeer {
  connectionState = "new";
  iceGatheringState = "complete"; // skips gatherAndOffer's 1 s wait in tests
  localDescription: { sdp: string } | null = null;
  onconnectionstatechange: (() => void) | null = null;
  onicegatheringstatechange: (() => void) | null = null;
  channels: FakeChannel[] = [];
  closed = false;
  offerCount = 0;
  dataChannelOptions: Array<{ label: string; options: Record<string, unknown> }> = [];
  private hostSides: FakeLinkSide[] = [];
  private readonly schedule: LinkScheduler;

  constructor(schedule: LinkScheduler) {
    this.schedule = schedule;
  }

  createDataChannel(label: string, options: Record<string, unknown>): LinkChannel {
    this.dataChannelOptions.push({ label, options });
    const fake = createFakeLink({ schedule: this.schedule });
    this.hostSides.push(fake.b);
    const channel = new FakeChannel(fake.a);
    this.channels.push(channel);
    return channel;
  }

  /** The host's end of one channel, by creation order (0: cc-stream, 1: cc-events). */
  hostSide(index: number): FakeLinkSide {
    const side = this.hostSides[index];
    if (side === undefined) throw new Error(`no channel ${index} created yet`);
    return side;
  }

  async createOffer(): Promise<{ sdp?: string }> {
    this.offerCount += 1;
    return { sdp: fakeOfferSdp(`ufrag${this.offerCount}`) };
  }

  async setLocalDescription(description: { type: "offer"; sdp: string }): Promise<void> {
    this.localDescription = { sdp: description.sdp };
  }

  remoteDescriptionCalls = 0;

  async setRemoteDescription(): Promise<void> {
    // The codec round trip is CC-3.16's own test; the link runtime only needs the call to resolve.
    this.remoteDescriptionCalls += 1;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.connectionState = "closed";
    this.onconnectionstatechange?.();
  }

  fail(): void {
    this.connectionState = "failed";
    this.onconnectionstatechange?.();
  }
}

/** Flushes a handful of microtask ticks, enough for a resolved-promise chain to settle. */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

/** Deterministic virtual time for `LinkScheduler`, so tests advance milliseconds instead of
 * waiting on wall-clock timers, and flush the microtask queue after each timer fires. */
function createVirtualSchedule() {
  let now = 0;
  let nextId = 0;
  const timers: Array<{ id: number; due: number; cb: () => void }> = [];

  const schedule: LinkScheduler = (cb, delayMs) => {
    const id = nextId++;
    timers.push({ id, due: now + delayMs, cb });
    return () => {
      const index = timers.findIndex((timer) => timer.id === id);
      if (index !== -1) timers.splice(index, 1);
    };
  };

  async function advance(ms: number): Promise<void> {
    await flush(); // let any already-queued microtasks (e.g. a resolved promise chain) settle first
    const target = now + ms;
    for (;;) {
      timers.sort((a, b) => a.due - b.due);
      const next = timers[0];
      if (next === undefined || next.due > target) break;
      now = next.due;
      timers.splice(0, 1);
      next.cb();
      await flush();
    }
    now = target;
  }

  return { schedule, now: () => now, advance, flush };
}

const you: PlayerInfo = {
  id: "PLAYER01",
  name: "Sam",
  slot: 0,
  profile: { skin: 0, hair: 0, hairColour: 0 },
  joinedAt: 0,
  connected: true,
};

const storedSession = { code: "BEAN", playerId: you.id, rejoinToken: "r.sig" };

const seatedWelcomed: PhoneState = reduce(initialState(null, storedSession), {
  type: "message",
  message: { t: "room:welcome", d: { role: "player", code: "BEAN", phase: "lobby", you } },
});

const audienceWelcomed: PhoneState = reduce(initialState(null, storedSession), {
  type: "message",
  message: {
    t: "room:welcome",
    d: { role: "audience", code: "BEAN", phase: "lobby", you: { ...you, slot: null } },
  },
});

function createRig(overrides: Partial<ControllerLinkOptions> = {}) {
  const virtual = createVirtualSchedule();
  const sent: PhoneToRelayMessage[] = [];
  let peer: FakePeer | null = null;
  let visibilityListener: (() => void) | null = null;
  let visible = true;

  const link = createControllerLink({
    sendMessage: (message) => sent.push(message),
    enabled: () => true,
    supportsLink: () => true,
    createPeer: () => {
      peer = new FakePeer(virtual.schedule);
      return peer;
    },
    clock: { timeOrigin: 0, now: virtual.now },
    toHostTime: (localMs) => Math.round(localMs),
    schedule: virtual.schedule,
    isPageVisible: () => visible,
    onVisibilityChange: (listener) => {
      visibilityListener = listener;
      return () => {
        visibilityListener = null;
      };
    },
    warn: () => {},
    ...overrides,
  });

  return {
    link,
    sent,
    virtual,
    currentPeer: () => peer,
    setVisible: async (next: boolean) => {
      visible = next;
      visibilityListener?.();
      await virtual.flush();
    },
  };
}

/** Drives one rig from a fresh `rtc:offer` to `direct`: opens both channels, then plays the host
 * side of `cc-stream` long enough to answer 3 `link:ping`s. */
async function goDirect(rig: ReturnType<typeof createRig>): Promise<void> {
  await rig.virtual.advance(0);
  const peer = rig.currentPeer();
  if (peer === null) throw new Error("no peer attempt started");
  peer.channels[0]?.open();
  peer.channels[1]?.open();
  await rig.virtual.flush();

  let pongsSent = 0;
  const hostStream = peer.hostSide(0);
  const unsubscribe = hostStream.onMessage((data) => {
    if (typeof data !== "string" || pongsSent >= 3) return;
    const { t, d } = JSON.parse(data) as { t: string; d: { id: number; t0: number } };
    if (t !== "link:ping") return;
    pongsSent += 1;
    hostStream.send(
      JSON.stringify({
        t: "link:pong",
        d: { id: d.id, t0: d.t0, t1: d.t0 + 1, t2: d.t0 + 2, r: 0 },
      }),
    );
  });
  await rig.virtual.advance(200); // several 50 ms connecting-phase pings; 3 pongs promote to direct
  unsubscribe();
}

describe("link-switch", () => {
  it("is off unless VITE_REALTIME_LINK is on", () => {
    expect(realtimeLinkEnabled({ env: false, search: "" })).toBe(false);
    expect(realtimeLinkEnabled({ env: true, search: "" })).toBe(true);
  });

  it("lets ?link=1 and ?link=0 override the build default for one page load", () => {
    expect(realtimeLinkEnabled({ env: false, search: "?link=1" })).toBe(true);
    expect(realtimeLinkEnabled({ env: true, search: "?link=0" })).toBe(false);
    expect(realtimeLinkEnabled({ env: false, search: "?room=BEAN" })).toBe(false);
  });
});

describe("AC1: a seated phone offers after room:welcome while the TV is connected", () => {
  it("sends rtc:offer with iceServers: [] and both negotiated channels", async () => {
    const rig = createRig();
    rig.link.follow(seatedWelcomed);
    await rig.virtual.advance(0);

    expect(rig.sent).toHaveLength(1);
    expect(rig.sent[0]).toMatchObject({ t: "rtc:offer" });
    if (rig.sent[0]?.t !== "rtc:offer") throw new Error("expected rtc:offer");
    expect(rig.sent[0].d.desc.c).toHaveLength(1);

    const peer = rig.currentPeer();
    expect(peer?.dataChannelOptions).toEqual([
      {
        label: "cc-stream",
        options: { negotiated: true, id: 0, ordered: false, maxRetransmits: 0 },
      },
      { label: "cc-events", options: { negotiated: true, id: 1 } },
    ]);
  });

  it("never offers while the TV is away, even seated", async () => {
    const hostAway: PhoneState = reduce(seatedWelcomed, {
      type: "message",
      message: { t: "room:host", d: { connected: false } },
    });
    const rig = createRig();
    rig.link.follow(hostAway);
    await rig.virtual.advance(0);
    expect(rig.sent).toHaveLength(0);
  });
});

describe("AC2: audience phones and unsupported browsers never offer", () => {
  it("never offers for an audience phone", async () => {
    const rig = createRig();
    rig.link.follow(audienceWelcomed);
    await rig.virtual.advance(0);
    expect(rig.sent).toHaveLength(0);
    expect(rig.link.path).toBe("off");
  });

  it("never offers, and falls back to relay, without RTCPeerConnection", async () => {
    const rig = createRig({ supportsLink: () => false });
    rig.link.follow(seatedWelcomed);
    await rig.virtual.advance(0);
    expect(rig.sent).toHaveLength(0);
    expect(rig.link.path).toBe("relay");
  });
});

describe("AC3: the link switch", () => {
  it("never offers while the switch is off", async () => {
    const rig = createRig({ enabled: () => false });
    rig.link.follow(seatedWelcomed);
    await rig.virtual.advance(0);
    expect(rig.sent).toHaveLength(0);
    expect(rig.link.path).toBe("relay");
  });

  it("offers once the switch reads on", async () => {
    const rig = createRig({ enabled: () => true });
    rig.link.follow(seatedWelcomed);
    await rig.virtual.advance(0);
    expect(rig.sent).toHaveLength(1);
  });
});

describe("AC4: game controllers get input, and a cut link falls back within 1 s", () => {
  it("streams over the direct channel once direct, then over the relay within 1 s of a cut", async () => {
    const rig = createRig();
    rig.link.follow(seatedWelcomed);
    await goDirect(rig);
    expect(rig.link.state).toBe("direct");

    const peer = rig.currentPeer();
    const directFrames: string[] = [];
    peer?.hostSide(0).onMessage((data) => {
      if (typeof data === "string" && data.includes('"input"')) directFrames.push(data);
    });

    const channel = rig.link.createChannel<GameInput>({ aim: { hz: 30 } });
    channel.stream({ type: "aim", payload: { yaw: 1 } }, rig.virtual.now());
    await rig.virtual.advance(0); // the fake channel's own delivery is scheduled, not synchronous
    expect(directFrames).toHaveLength(1);
    expect(rig.sent.some((message) => message.t === "input")).toBe(false);

    peer?.fail(); // the connection drops
    await rig.virtual.advance(1_000);
    expect(rig.link.state).not.toBe("direct");

    channel.stream({ type: "aim", payload: { yaw: 2 } }, rig.virtual.now());
    await rig.virtual.advance(0);
    expect(rig.sent.some((message) => message.t === "input")).toBe(true);
  });
});

describe("AC5: page visibility", () => {
  it("closes the link when the page is hidden, and offers again with a new attempt id once visible", async () => {
    const rig = createRig();
    rig.link.follow(seatedWelcomed);
    await rig.virtual.advance(0);
    expect(rig.sent).toHaveLength(1);
    const firstAttempt = rig.sent[0]?.t === "rtc:offer" ? rig.sent[0].d.s : null;
    const firstPeer = rig.currentPeer();

    await rig.setVisible(false);
    expect(rig.link.state).toBe("off");
    expect(firstPeer?.closed).toBe(true);

    await rig.setVisible(true);
    rig.link.follow(seatedWelcomed); // room:welcome arrived again
    await rig.virtual.advance(0);

    expect(rig.sent).toHaveLength(2);
    const secondAttempt = rig.sent[1]?.t === "rtc:offer" ? rig.sent[1].d.s : null;
    expect(secondAttempt).not.toBe(firstAttempt);
  });
});

describe("AC6: the dev readout never carries an address", () => {
  it("exposes only a path and a round-trip number", async () => {
    const rig = createRig();
    rig.link.follow(seatedWelcomed);
    expect(rig.link.rttMs).toBeNull();
    await goDirect(rig);

    expect(["off", "connecting", "direct", "stale", "relay"]).toContain(rig.link.state);
    expect(rig.link.path).toBe("direct");
    expect(typeof rig.link.rttMs).toBe("number");
    // Nothing candidate- or address-shaped ever comes off the public surface.
    expect(Object.keys(rig.link)).not.toContain("candidates");
  });
});

describe("retrying on the relay path", () => {
  it("does not retry on every follow() call, only on a real trigger or the backoff timer", async () => {
    const rig = createRig();
    rig.link.follow(seatedWelcomed);
    await rig.virtual.advance(0);
    expect(rig.sent).toHaveLength(1); // the first offer

    await rig.virtual.advance(5_000); // connectTimeoutMs: no answer ever arrives
    expect(rig.link.state).toBe("relay");

    // Ordinary room traffic keeps calling follow() with the same active state; none of it is a
    // trigger, so it must not cancel the state machine's own backoff and re-offer early.
    rig.link.follow(seatedWelcomed);
    rig.link.follow(seatedWelcomed);
    await rig.virtual.advance(1_000);
    expect(rig.sent).toHaveLength(1);

    await rig.virtual.advance(9_000); // the 10 s backoff timer retries on its own
    expect(rig.sent.length).toBeGreaterThan(1);
  });

  it("retries at once when a new game starts", async () => {
    const rig = createRig();
    rig.link.follow(seatedWelcomed);
    await rig.virtual.advance(5_000); // times out to relay, no answer ever arrives
    expect(rig.link.state).toBe("relay");
    expect(rig.sent).toHaveLength(1);

    const gameStarted: PhoneState = reduce(seatedWelcomed, {
      type: "message",
      message: {
        t: "controller:state",
        d: { gameId: "tap-race", view: { screen: "tap", data: null } },
      },
    });
    rig.link.follow(gameStarted);
    await rig.virtual.advance(0);
    expect(rig.sent).toHaveLength(2); // retried at once, without waiting for the 10 s backoff
  });
});

describe("ignoring a stale answer", () => {
  it("ignores an rtc:answer whose attempt id doesn't match the current one", async () => {
    const rig = createRig();
    rig.link.follow(seatedWelcomed);
    await rig.virtual.advance(0);
    const peer = rig.currentPeer();

    rig.link.receiveAnswer({
      s: 0, // never the real random attempt id
      desc: { u: "x", p: "y".repeat(22), f: Buffer.alloc(32).toString("base64url"), c: [] },
    });
    await rig.virtual.flush();
    expect(peer?.remoteDescriptionCalls).toBe(0);
  });
});
