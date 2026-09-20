import type { LinkScheduler } from "@couchcade/game-sdk/link";
import { createFakeLink, type FakeLinkSide } from "@couchcade/game-sdk/testing";
import type { HostToRelayMessage } from "@couchcade/protocol";
import { describe, expect, it } from "vitest";
import type { InputPayload } from "../../src/runtime/game-runner.ts";
import {
  createHostLinks,
  type HostLinkChannel,
  type HostLinkPeer,
  type HostLinksOptions,
} from "../../src/runtime/links.ts";

// ---- A fake RTCPeerConnection/RTCDataChannel pair, answer-side, so the link runtime runs
// without a real WebRTC stack. Message delivery goes through the SDK's own `createFakeLink`
// (`@couchcade/game-sdk/testing`), the same fake `apps/controller/test/runtime/link.test.ts`
// (CC-3.19) uses; this only adds the `readyState`/`onopen`/`onclose` a real `RTCDataChannel` has
// on top of it. ----

class FakeChannel implements HostLinkChannel {
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

/** A minimal offer/answer SDP whose ufrag, password and fingerprint `encodeDescription` (CC-3.16)
 * can parse, with one UDP host candidate. Real enough for the link runtime; the codec itself is
 * CC-3.16's own test. */
function fakeSdp(ufrag: string): string {
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

class FakePeer implements HostLinkPeer {
  connectionState = "new";
  iceGatheringState = "complete"; // skips gatherAndAnswer's 1 s wait in tests
  localDescription: { sdp: string } | null = null;
  onconnectionstatechange: (() => void) | null = null;
  onicegatheringstatechange: (() => void) | null = null;
  channels: FakeChannel[] = [];
  closed = false;
  answerCount = 0;
  remoteDescriptionCalls = 0;
  dataChannelOptions: Array<{ label: string; options: Record<string, unknown> }> = [];
  private phoneSides: FakeLinkSide[] = [];
  private readonly schedule: LinkScheduler;

  constructor(schedule: LinkScheduler) {
    this.schedule = schedule;
  }

  createDataChannel(label: string, options: Record<string, unknown>): HostLinkChannel {
    this.dataChannelOptions.push({ label, options });
    const fake = createFakeLink({ schedule: this.schedule });
    this.phoneSides.push(fake.b);
    const channel = new FakeChannel(fake.a);
    this.channels.push(channel);
    return channel;
  }

  /** The phone's end of one channel, by creation order (0: cc-stream, 1: cc-events). */
  phoneSide(index: number): FakeLinkSide {
    const side = this.phoneSides[index];
    if (side === undefined) throw new Error(`no channel ${index} created yet`);
    return side;
  }

  async setRemoteDescription(): Promise<void> {
    this.remoteDescriptionCalls += 1;
  }

  async createAnswer(): Promise<{ sdp?: string }> {
    this.answerCount += 1;
    return { sdp: fakeSdp(`ans${this.answerCount}`) };
  }

  async setLocalDescription(description: { type: "answer"; sdp: string }): Promise<void> {
    this.localDescription = { sdp: description.sdp };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.connectionState = "closed";
    this.onconnectionstatechange?.();
  }
}

/** Deterministic virtual time, for the `now`/`roomOffsetMs` the runtime reads and for the fake
 * channels' own delivery scheduling, so tests advance milliseconds instead of waiting on
 * wall-clock timers. */
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

  async function flush(): Promise<void> {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  }

  async function advance(ms: number): Promise<void> {
    await flush();
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

const player1 = "PLAYER01";
const player2 = "PLAYER02";

function createRig(overrides: Partial<HostLinksOptions> = {}) {
  const virtual = createVirtualSchedule();
  const sent: HostToRelayMessage[] = [];
  const warnings: string[] = [];
  const inputs: Array<{ playerId: string; input: InputPayload }> = [];
  const peers: FakePeer[] = [];
  let seated = new Set<string>([player1, player2]);
  let scheduleCalls = 0;

  const links = createHostLinks({
    sendMessage: (message) => sent.push(message),
    isSeatedPlayer: (id) => seated.has(id),
    enabled: () => true,
    onInput: (playerId, input) => inputs.push({ playerId, input }),
    createPeer: () => {
      const peer = new FakePeer(virtual.schedule);
      peers.push(peer);
      return peer;
    },
    now: virtual.now,
    roomOffsetMs: () => 7,
    schedule: (cb, delayMs) => {
      scheduleCalls += 1;
      return virtual.schedule(cb, delayMs);
    },
    warn: (message) => warnings.push(message),
    ...overrides,
  });

  return {
    links,
    sent,
    warnings,
    inputs,
    virtual,
    peers,
    currentPeer: () => peers[peers.length - 1] ?? null,
    setSeated: (ids: readonly string[]) => (seated = new Set(ids)),
    scheduleCallCount: () => scheduleCalls,
  };
}

async function offer(rig: ReturnType<typeof createRig>, from: string, attempt = 1): Promise<void> {
  rig.links.receiveOffer(from, {
    s: attempt,
    desc: { u: `u${attempt}`, p: "pppppppppppppppppppppppppppppp", f: "A".repeat(43), c: [] },
  });
  await rig.virtual.advance(0);
}

/** Opens both channels of the most recent peer, as if the WebRTC handshake finished. */
function openChannels(peer: FakePeer): void {
  peer.channels[0]?.open();
  peer.channels[1]?.open();
}

describe("the link switch", () => {
  it("never answers, whatever a phone's own switch says, while the host's switch is off", async () => {
    const rig = createRig({ enabled: () => false });
    await offer(rig, player1);
    expect(rig.sent).toHaveLength(0);
    expect(rig.peers).toHaveLength(0);
  });
});

describe("AC1: the host answers rtc:offer from a seated player only", () => {
  it("ignores an offer from a player who isn't seated", async () => {
    const rig = createRig();
    rig.setSeated([]);
    await offer(rig, player1);
    expect(rig.sent).toHaveLength(0);
    expect(rig.peers).toHaveLength(0);
  });

  it("answers with rtc:answer targeted at that player, and both negotiated channels", async () => {
    const rig = createRig();
    await offer(rig, player1, 42);

    expect(rig.sent).toEqual([
      { t: "rtc:answer", d: { to: player1, s: 42, desc: expect.any(Object) } },
    ]);
    const peer = rig.currentPeer();
    expect(peer?.dataChannelOptions).toEqual([
      {
        label: "cc-stream",
        options: { negotiated: true, id: 0, ordered: false, maxRetransmits: 0 },
      },
      { label: "cc-events", options: { negotiated: true, id: 1 } },
    ]);
  });

  it("ignores a second offer from the same player within 5 s", async () => {
    const rig = createRig();
    await offer(rig, player1, 1);
    await rig.virtual.advance(2_000);
    await offer(rig, player1, 2);

    expect(rig.peers).toHaveLength(1);
    expect(rig.sent).toHaveLength(1);
  });

  it("replaces that player's older link once 5 s have passed", async () => {
    const rig = createRig();
    await offer(rig, player1, 1);
    const older = rig.currentPeer();
    await rig.virtual.advance(5_001);
    await offer(rig, player1, 2);

    expect(older?.closed).toBe(true);
    expect(rig.peers).toHaveLength(2);
    expect(rig.sent).toEqual([
      { t: "rtc:answer", d: { to: player1, s: 1, desc: expect.any(Object) } },
      { t: "rtc:answer", d: { to: player1, s: 2, desc: expect.any(Object) } },
    ]);
  });

  it("answers each seated player independently", async () => {
    const rig = createRig();
    await offer(rig, player1, 1);
    await offer(rig, player2, 2);
    expect(rig.peers).toHaveLength(2);
    expect(rig.sent.map((m) => (m.t === "rtc:answer" ? m.d.to : null))).toEqual([player1, player2]);
  });
});

describe("AC2: link frames are attributed and validated", () => {
  async function directRig(): Promise<{
    rig: ReturnType<typeof createRig>;
    peer: FakePeer;
  }> {
    const rig = createRig();
    await offer(rig, player1);
    const peer = rig.currentPeer();
    if (peer === null) throw new Error("no peer");
    openChannels(peer);
    await rig.virtual.advance(0);
    return { rig, peer };
  }

  it("attributes a valid stream input to the offering player", async () => {
    const { rig, peer } = await directRig();
    peer.phoneSide(0).send(JSON.stringify({ t: "input", d: { type: "aim", at: 10, n: 1 } }));
    await rig.virtual.advance(0);

    expect(rig.inputs).toEqual([{ playerId: player1, input: { type: "aim", at: 10, n: 1 } }]);
  });

  it("drops a frame that carries from", async () => {
    const { rig, peer } = await directRig();
    peer
      .phoneSide(0)
      .send(JSON.stringify({ t: "input", d: { type: "aim", at: 10, n: 1 }, from: player1 }));
    await rig.virtual.advance(0);
    expect(rig.inputs).toHaveLength(0);
  });

  it("drops an oversized frame", async () => {
    const { rig, peer } = await directRig();
    const huge = "x".repeat(1_100);
    peer
      .phoneSide(0)
      .send(JSON.stringify({ t: "input", d: { type: "aim", at: 10, n: 1, payload: huge } }));
    await rig.virtual.advance(0);
    expect(rig.inputs).toHaveLength(0);
  });

  it("drops a binary frame", async () => {
    const { rig, peer } = await directRig();
    peer.phoneSide(0).send(new ArrayBuffer(4) as unknown as string);
    await rig.virtual.advance(0);
    expect(rig.inputs).toHaveLength(0);
  });

  it("drops invalid JSON", async () => {
    const { rig, peer } = await directRig();
    peer.phoneSide(0).send("{not json");
    await rig.virtual.advance(0);
    expect(rig.inputs).toHaveLength(0);
  });

  it("drops a frame that fails its schema", async () => {
    const { rig, peer } = await directRig();
    peer.phoneSide(0).send(JSON.stringify({ t: "input", d: { type: "" } }));
    await rig.virtual.advance(0);
    expect(rig.inputs).toHaveLength(0);
  });

  it("drops anything but an input event on cc-events", async () => {
    const { rig, peer } = await directRig();
    peer.phoneSide(1).send(JSON.stringify({ t: "link:ping", d: { id: 1, t0: 0 } }));
    await rig.virtual.advance(0);
    expect(rig.inputs).toHaveLength(0);
  });

  it("drops a direct stream sample older than one already applied, without a warning", async () => {
    const { rig, peer } = await directRig();
    peer.phoneSide(0).send(JSON.stringify({ t: "input", d: { type: "aim", at: 10, n: 5 } }));
    peer.phoneSide(0).send(JSON.stringify({ t: "input", d: { type: "aim", at: 20, n: 3 } }));
    await rig.virtual.advance(0);
    expect(rig.inputs).toEqual([{ playerId: player1, input: { type: "aim", at: 10, n: 5 } }]);
  });
});

describe("AC3: more than 100 dropped frames in 10 s cuts the phone off", () => {
  it("closes the link and ignores offers from that player for 60 s", async () => {
    const rig = createRig();
    await offer(rig, player1);
    const peer = rig.currentPeer();
    if (peer === null) throw new Error("no peer");
    openChannels(peer);
    await rig.virtual.advance(0);

    for (let i = 0; i < 101; i++) {
      peer.phoneSide(0).send("{not json");
      await rig.virtual.advance(10);
    }

    expect(peer.closed).toBe(true);

    await offer(rig, player1, 99);
    expect(rig.peers).toHaveLength(1); // still cut off: no new peer

    await rig.virtual.advance(60_001);
    await offer(rig, player1, 100);
    expect(rig.peers).toHaveLength(2); // the 60 s window passed
  });
});

describe("AC4: the host closes a player's link on demand", () => {
  it("close() tears the peer and its channels down", async () => {
    const rig = createRig();
    await offer(rig, player1);
    const peer = rig.currentPeer();
    rig.links.close(player1);
    expect(peer?.closed).toBe(true);
    expect(rig.links.link(player1)).toEqual({
      path: "relay",
      rttMs: null,
      playbackDelayMs: 180,
    });
  });

  it("close() on a player with no link does nothing", () => {
    const rig = createRig();
    expect(() => rig.links.close(player1)).not.toThrow();
  });

  it("closeAll() closes every open link", async () => {
    const rig = createRig();
    await offer(rig, player1, 1);
    await offer(rig, player2, 2);
    const [peerA, peerB] = rig.peers;
    rig.links.closeAll();
    expect(peerA?.closed).toBe(true);
    expect(peerB?.closed).toBe(true);
  });
});

describe("AC6: the host answers link:ping with link:pong, and sets no host timers", () => {
  it("replies with t1, t2 and the room clock offset", async () => {
    const rig = createRig();
    await offer(rig, player1);
    const peer = rig.currentPeer();
    if (peer === null) throw new Error("no peer");
    openChannels(peer);
    await rig.virtual.advance(0);

    const pongs: unknown[] = [];
    peer.phoneSide(0).onMessage((data) => pongs.push(JSON.parse(data as string)));
    peer
      .phoneSide(0)
      .send(JSON.stringify({ t: "link:ping", d: { id: 3, t0: 111, rttMs: null, jitterMs: 0 } }));
    await rig.virtual.advance(0);

    expect(pongs).toEqual([
      {
        t: "link:pong",
        d: { id: 3, t0: 111, t1: expect.any(Number), t2: expect.any(Number), r: 7 },
      },
    ]);
  });

  it("never calls schedule while ICE gathering completes synchronously", async () => {
    const rig = createRig();
    await offer(rig, player1);
    const peer = rig.currentPeer();
    if (peer === null) throw new Error("no peer");
    openChannels(peer);
    peer.phoneSide(0).send(JSON.stringify({ t: "link:ping", d: { id: 1, t0: 0 } }));
    await rig.virtual.advance(0);

    expect(rig.scheduleCallCount()).toBe(0);
  });
});

describe("AC7: HostSceneData.link reports path, round trip and playback delay", () => {
  it("reports the relay defaults for a player with no open link", () => {
    const rig = createRig();
    expect(rig.links.link(player1)).toEqual({ path: "relay", rttMs: null, playbackDelayMs: 180 });
  });

  it("reports direct once both channels of a link are open", async () => {
    const rig = createRig();
    await offer(rig, player1);
    const peer = rig.currentPeer();
    if (peer === null) throw new Error("no peer");
    openChannels(peer);
    await rig.virtual.advance(0);

    const info = rig.links.link(player1);
    expect(info.path).toBe("direct");
    expect(info.playbackDelayMs).toBeGreaterThanOrEqual(25);
    expect(info.playbackDelayMs).toBeLessThanOrEqual(120);
  });

  it("stays relay until both channels are open", async () => {
    const rig = createRig();
    await offer(rig, player1);
    const peer = rig.currentPeer();
    peer?.channels[0]?.open(); // only cc-stream
    await rig.virtual.advance(0);
    expect(rig.links.link(player1).path).toBe("relay");
  });
});

describe("CC-3.26: link() reports the phone's link:ping-reported rttMs and jitter", () => {
  async function directRig(): Promise<{ rig: ReturnType<typeof createRig>; peer: FakePeer }> {
    const rig = createRig();
    await offer(rig, player1);
    const peer = rig.currentPeer();
    if (peer === null) throw new Error("no peer");
    openChannels(peer);
    await rig.virtual.advance(0);
    return { rig, peer };
  }

  it("AC3: falls back to the zero-jitter default before the phone's first link:ping", async () => {
    const { rig } = await directRig();
    const info = rig.links.link(player1);
    expect(info.path).toBe("direct");
    expect(info.rttMs).toBeNull();
    expect(info.playbackDelayMs).toBeCloseTo(1000 / 30, 5); // clamp(1000/30 + 2*0, 25, 120)
  });

  it("AC2/AC3: stores the phone's reported rttMs/jitterMs and feeds jitter into playbackDelayMs", async () => {
    const { rig, peer } = await directRig();
    peer
      .phoneSide(0)
      .send(JSON.stringify({ t: "link:ping", d: { id: 1, t0: 0, rttMs: 42, jitterMs: 15 } }));
    await rig.virtual.advance(0);

    const info = rig.links.link(player1);
    expect(info.path).toBe("direct");
    expect(info.rttMs).toBe(42);
    expect(info.playbackDelayMs).toBeCloseTo(Math.min(120, Math.max(25, 1000 / 30 + 2 * 15)), 5);
  });

  it("AC2: updates rttMs/jitterMs on every later link:ping", async () => {
    const { rig, peer } = await directRig();
    peer
      .phoneSide(0)
      .send(JSON.stringify({ t: "link:ping", d: { id: 1, t0: 0, rttMs: 42, jitterMs: 15 } }));
    await rig.virtual.advance(0);
    peer
      .phoneSide(0)
      .send(JSON.stringify({ t: "link:ping", d: { id: 2, t0: 10, rttMs: 30, jitterMs: 5 } }));
    await rig.virtual.advance(0);

    const info = rig.links.link(player1);
    expect(info.rttMs).toBe(30);
    expect(info.playbackDelayMs).toBeCloseTo(Math.min(120, Math.max(25, 1000 / 30 + 2 * 5)), 5);
  });

  it("still answers link:pong for a ping that also carries rttMs/jitterMs", async () => {
    const { rig, peer } = await directRig();
    const pongs: unknown[] = [];
    peer.phoneSide(0).onMessage((data) => pongs.push(JSON.parse(data as string)));
    peer
      .phoneSide(0)
      .send(JSON.stringify({ t: "link:ping", d: { id: 9, t0: 111, rttMs: 20, jitterMs: 4 } }));
    await rig.virtual.advance(0);

    expect(pongs).toEqual([
      {
        t: "link:pong",
        d: { id: 9, t0: 111, t1: expect.any(Number), t2: expect.any(Number), r: 7 },
      },
    ]);
  });

  it("AC4: a phone whose own link never got a pong yet reports null rttMs and 0 jitter", async () => {
    const { rig, peer } = await directRig();
    peer
      .phoneSide(0)
      .send(JSON.stringify({ t: "link:ping", d: { id: 1, t0: 0, rttMs: null, jitterMs: 0 } }));
    await rig.virtual.advance(0);

    const info = rig.links.link(player1);
    expect(info.path).toBe("direct");
    expect(info.rttMs).toBeNull();
    expect(info.playbackDelayMs).toBeCloseTo(1000 / 30, 5);
  });

  it("AC4: a link that drops before its first pong never throws and stays at the relay default", async () => {
    const rig = createRig();
    await offer(rig, player1);
    const peer = rig.currentPeer();
    if (peer === null) throw new Error("no peer");
    peer.channels[0]?.open(); // only cc-stream: never reaches direct, never pings
    await rig.virtual.advance(0);
    peer.channels[0]?.close(); // and now drops entirely

    expect(() => rig.links.link(player1)).not.toThrow();
    expect(rig.links.link(player1)).toEqual({ path: "relay", rttMs: null, playbackDelayMs: 180 });
  });
});
