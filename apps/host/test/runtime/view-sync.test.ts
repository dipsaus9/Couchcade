import { createPlayers } from "@couchcade/game-sdk/testing";
import {
  encode,
  hostToRelaySchema,
  maxFrameBytes,
  utf8ByteLength,
  type ControllerView,
  type HostToRelayMessage,
} from "@couchcade/protocol";
import { describe, expect, it } from "vitest";
import { controllerStateMinGapMs, createViewSync } from "../../src/runtime/view-sync.ts";
import { createVirtualTime } from "./fixtures.ts";

const ids = createPlayers(8).map((player) => player.id);
const [sam, noor, mees] = ids as [string, string, string];

const view = (text: string): ControllerView => ({ screen: "echo", data: { text } });
const viewsOf = (...entries: Array<[string, ControllerView]>) => new Map(entries);

function setup() {
  const time = createVirtualTime(5000);
  const sent: HostToRelayMessage[] = [];
  const warnings: string[] = [];
  const sync = createViewSync({
    send: (message) => sent.push(message),
    now: time.now,
    schedule: time.schedule,
    warn: (message) => warnings.push(message),
  });
  return { time, sent, warnings, sync };
}

describe("createViewSync", () => {
  it("allows 1.5 sends per second: at least 667 ms apart", () => {
    expect(controllerStateMinGapMs).toBe(667);
    expect(1000 / controllerStateMinGapMs).toBeLessThanOrEqual(1.5);
  });

  it("sends the first change at once, with phones that share a view in one entry", () => {
    const { sent, sync } = setup();
    sync.show("echo", viewsOf([sam, view("")], [noor, view("")], [mees, view("hi")]));
    expect(sent).toEqual([
      {
        t: "controller:state",
        d: {
          gameId: "echo",
          views: [
            { to: [sam, noor], view: view("") },
            { to: [mees], view: view("hi") },
          ],
        },
      },
    ]);
    expect(hostToRelaySchema.safeParse(sent[0]).success).toBe(true);
  });

  it("sends only entries whose view changed since the last send", () => {
    const { time, sent, sync } = setup();
    sync.show("echo", viewsOf([sam, view("a")], [noor, view("b")]));
    time.advance(1000);
    sync.show("echo", viewsOf([sam, view("a")], [noor, view("c")]));
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({
      t: "controller:state",
      d: { gameId: "echo", views: [{ to: [noor], view: view("c") }] },
    });
    time.advance(1000);
    sync.show("echo", viewsOf([sam, view("a")], [noor, view("c")]));
    expect(sent).toHaveLength(2);
  });

  it("sends at most once per 667 ms, merging changes inside the window into the latest views", () => {
    const { time, sent, sync } = setup();
    sync.show("echo", viewsOf([sam, view("1")]));
    time.advance(100);
    sync.show("echo", viewsOf([sam, view("2")], [noor, view("x")]));
    time.advance(100);
    sync.show("echo", viewsOf([sam, view("3")], [noor, view("x")]));
    expect(sent).toHaveLength(1);

    time.advance(466);
    expect(sent).toHaveLength(1);
    time.advance(1);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({
      t: "controller:state",
      d: {
        gameId: "echo",
        views: [
          { to: [sam], view: view("3") },
          { to: [noor], view: view("x") },
        ],
      },
    });
  });

  it("never sends more than 1.5 times per second when views change every tick", () => {
    const { time, sent, sync } = setup();
    for (let tick = 0; tick < 60 * 10; tick++) {
      sync.show("echo", viewsOf([sam, view(String(tick))]));
      time.advance(1000 / 60);
    }
    // 10 seconds: the first send plus one per full 667 ms window.
    expect(sent.length).toBeLessThanOrEqual(1 + Math.floor(10_000 / 667));
    expect(sent.length).toBeGreaterThanOrEqual(14);
  });

  it("sends nothing when a change is undone inside the window", () => {
    const { time, sent, sync } = setup();
    sync.show("echo", viewsOf([sam, view("a")]));
    time.advance(100);
    sync.show("echo", viewsOf([sam, view("b")]));
    time.advance(100);
    sync.show("echo", viewsOf([sam, view("a")]));
    time.advance(2000);
    expect(sent).toHaveLength(1);
  });

  it("resends every view when the game id changes, as when returning to the lobby", () => {
    const { time, sent, sync } = setup();
    const lobby: ControllerView = { screen: "lobby", data: null };
    sync.show("echo", viewsOf([sam, lobby], [noor, lobby]));
    time.advance(1000);
    sync.show(null, viewsOf([sam, lobby], [noor, lobby]));
    expect(sent[1]).toEqual({
      t: "controller:state",
      d: { gameId: null, views: [{ to: [sam, noor], view: lobby }] },
    });
  });

  it("splits changed entries over several frames of at most 1 KB, with a dev warning", () => {
    const { sent, warnings, sync } = setup();
    const big = (i: number) => view(`${i}`.padEnd(300, "x"));
    sync.show("echo", new Map(ids.map((id, i) => [id, big(i)])));

    expect(sent.length).toBeGreaterThan(1);
    for (const message of sent) {
      expect(utf8ByteLength(JSON.stringify(message))).toBeLessThanOrEqual(maxFrameBytes);
      expect(() => encode(message)).not.toThrow();
    }
    const delivered = sent.flatMap((message) =>
      message.t === "controller:state" ? message.d.views : [],
    );
    expect(delivered.map((entry) => entry.to)).toEqual(ids.map((id) => [id]));
    expect(warnings).toEqual([expect.stringContaining(`split over ${sent.length} frames`)]);
  });

  it("halves a shared entry that doesn't fit one frame", () => {
    const { sent, sync } = setup();
    // 8 ids add about 90 bytes, enough to push this view over 1 KB when shared.
    const shared = view("y".repeat(900));
    sync.show("echo", new Map(ids.map((id) => [id, shared])));
    for (const message of sent) expect(() => encode(message)).not.toThrow();
    const delivered = sent.flatMap((message) =>
      message.t === "controller:state" ? message.d.views.flatMap((entry) => entry.to) : [],
    );
    expect(delivered).toEqual(ids);
  });

  it("drops a view that is over 1 KB for a single phone, with a warning", () => {
    const { sent, warnings, sync } = setup();
    sync.show("echo", viewsOf([sam, view("z".repeat(1100))], [noor, view("ok")]));
    expect(sent).toEqual([
      { t: "controller:state", d: { gameId: "echo", views: [{ to: [noor], view: view("ok") }] } },
    ]);
    expect(warnings).toEqual([expect.stringContaining(`for ${sam} is over 1024 bytes`)]);
  });

  it("cancels a pending send on dispose", () => {
    const { time, sent, sync } = setup();
    sync.show("echo", viewsOf([sam, view("a")]));
    sync.show("echo", viewsOf([sam, view("b")]));
    sync.dispose();
    time.advance(5000);
    expect(sent).toHaveLength(1);
    expect(time.pending).toBe(0);
  });
  it("sends a forgotten phone its unchanged view on the next show, inside the send cap", () => {
    const { time, sent, sync } = setup();
    sync.show("echo", viewsOf([sam, view("a")], [noor, view("b")]));
    sync.forget(noor);
    expect(sent).toHaveLength(1);

    sync.show("echo", viewsOf([sam, view("a")], [noor, view("b")]));
    expect(sent).toHaveLength(1);
    time.advance(667);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({
      t: "controller:state",
      d: { gameId: "echo", views: [{ to: [noor], view: view("b") }] },
    });
  });
});
