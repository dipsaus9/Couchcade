import { describe, expect, it } from "vitest";
import { cuesBetween } from "../../src/host/cues.ts";
import type { TargetRangeCue } from "../../src/host/cues.ts";
import { botRoom, spreadBots } from "./bots.ts";

describe("cuesBetween", () => {
  it("marks every sound moment of a 4-player match once, frame by frame", () => {
    const bots = botRoom(4, 5, spreadBots);
    const cues: TargetRangeCue[] = [...cuesBetween(null, bots.room.state)];
    let previous = bots.room.state;
    while (!bots.room.over) {
      const next = bots.step();
      cues.push(...cuesBetween(previous, next));
      previous = next;
    }
    const count = (type: TargetRangeCue["type"]) => cues.filter((cue) => cue.type === type).length;
    expect(
      cues.filter((cue) => cue.type === "round").map((cue) => cue.type === "round" && cue.round),
    ).toEqual([1, 2, 3, 4]);
    expect(count("open")).toBe(12);
    expect(count("reveal")).toBe(12);
    expect(count("roundEnd")).toBe(4);
    expect(count("over")).toBe(1);
    // Every seat shoots every volley here, and each arrow flies and lands once.
    expect(count("shoot")).toBe(48);
    expect(count("land")).toBe(48);
    expect(count("draw")).toBe(48);
    expect(cues.some((cue) => cue.type === "reveal" && cue.bullseye)).toBe(true);
    expect(cues.at(-1)).toEqual({ type: "over" });
  });

  it("ticks the last 3 seconds of a volley that runs out", () => {
    const bots = botRoom(6, 5, spreadBots);
    const ticks: number[] = [];
    let previous = bots.room.state;
    while (!(previous.phase === "landing" && previous.timedOut)) {
      const next = bots.step();
      for (const cue of cuesBetween(previous, next))
        if (cue.type === "tick") ticks.push(cue.seconds);
      previous = next;
    }
    expect(ticks).toEqual([3, 2, 1]);
  });

  it("skips nothing when the TV renders only every few ticks", () => {
    const bots = botRoom(4, 5, spreadBots);
    const cues: TargetRangeCue[] = [];
    let previous = bots.room.state;
    for (let frame = 0; !bots.room.over; frame++) {
      const next = bots.step();
      if (frame % 3 !== 0) continue;
      cues.push(...cuesBetween(previous, next));
      previous = next;
    }
    expect(cues.filter((cue) => cue.type === "reveal")).toHaveLength(12);
    expect(cues.filter((cue) => cue.type === "shoot")).toHaveLength(48);
  });
});
