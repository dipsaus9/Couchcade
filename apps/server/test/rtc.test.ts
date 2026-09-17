// WebRTC signalling relay (docs/architecture/realtime-link.md, "Signalling" and "What the room
// does"): the room only introduces a seated player and the host, forwards `rtc:offer` and
// `rtc:answer` unopened, and never stores or parses `desc` beyond the protocol schema.
import { describe, expect, it, vi } from "vitest";
import { RoomStorage } from "../src/room/storage.ts";
import { connectHost, createRoom, joinPhone } from "./helpers.ts";

/** A compact description shaped like realtime-link.md's example, well under 1 KB. */
const desc = {
  u: "4pKz",
  p: "aVeryRandomIceP4ssw0rdString",
  f: "MEUCIQC1zX9k8Q3H8vN2yV0pQ1bE7Zt3Y6r8Xw2Fj4KpM5nL0AIgd8jY6vQ2c",
  c: [["1", 2_130_706_431, "8f14e45f-ceea-4e8d-9c4a-1f2b3c4d5e6f.local", 54_321, "host"]],
};
const offer = { t: "rtc:offer", d: { s: 1, desc } };

describe("rtc:offer", () => {
  it("forwards only from a seated player to the host, with from set by the relay", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const player = await joinPhone(code, host);

    player.socket.send(offer);
    expect(await host.expect("rtc:offer")).toEqual({ t: "rtc:offer", d: offer.d, from: player.id });
  });

  it("drops an offer from an audience phone", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    for (let i = 0; i < 8; i++) await joinPhone(code, host);
    const audience = await joinPhone(code, host);
    expect(audience.welcome.role).toBe("audience");

    audience.socket.send(offer);
    expect(await audience.socket.drain()).toEqual([]);
    expect(await host.drain()).toEqual([]);
  });

  it("drops an offer sent by the host", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const player = await joinPhone(code, host);

    host.send(offer);
    expect(await host.drain()).toEqual([]);
    expect(await player.socket.drain()).toEqual([]);
  });

  it("drops an oversized offer before it reaches the host", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const player = await joinPhone(code, host);

    player.socket.send({ t: "rtc:offer", d: { s: 1, desc: { ...desc, f: "x".repeat(1_200) } } });
    expect(await host.drain()).toEqual([]);
    expect(await player.socket.drain()).toEqual([]);
  });
});

describe("rtc:answer", () => {
  it("reaches only the connected phone named in to, with to removed", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const target = await joinPhone(code, host);
    const bystander = await joinPhone(code, host);

    host.send({ t: "rtc:answer", d: { to: target.id, s: 7, desc } });
    expect(await target.socket.expect("rtc:answer")).toEqual({
      t: "rtc:answer",
      d: { s: 7, desc },
    });
    expect(await bystander.socket.drain()).toEqual([]);
  });

  it("drops an answer to an unknown player id", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const player = await joinPhone(code, host);

    host.send({ t: "rtc:answer", d: { to: "ZZZZZZZZ", s: 7, desc } });
    expect(await player.socket.drain()).toEqual([]);
    expect(await host.drain()).toEqual([]);
  });

  it("drops an answer to a player who disconnected", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const gone = await joinPhone(code, host);
    gone.socket.close();
    await gone.socket.closed;
    await host.expect("player:left");

    host.send({ t: "rtc:answer", d: { to: gone.id, s: 7, desc } });
    expect(await host.drain()).toEqual([]);
  });

  it("drops an answer sent by a phone", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const target = await joinPhone(code, host);

    target.socket.send({ t: "rtc:answer", d: { to: target.id, s: 7, desc } });
    expect(await target.socket.drain()).toEqual([]);
    expect(await host.drain()).toEqual([]);
  });
});

describe("storage", () => {
  it("makes no storage write for rtc:offer or rtc:answer", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const player = await joinPhone(code, host);

    const writers = [
      "create",
      "setLocked",
      "setPhase",
      "setHostSeenAt",
      "revokeHost",
      "savePlayer",
      "setProfile",
      "markLeft",
      "releasePlayer",
      "revokePlayer",
      "kickPlayer",
      "saveSnapshot",
    ] as const;
    const spies = writers.map((name) => vi.spyOn(RoomStorage.prototype, name));

    player.socket.send(offer);
    await host.expect("rtc:offer");
    host.send({ t: "rtc:answer", d: { to: player.id, s: 1, desc } });
    await player.socket.expect("rtc:answer");

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});
