import { describe, expect, it } from "vitest";
import { tickMs } from "@couchcade/game-sdk/contract";
import { createPlayers } from "@couchcade/game-sdk/testing";
import { world } from "@couchcade/theme";
import { cuesBetween } from "../../src/host/cues.ts";
import type { QuickDrawCue } from "../../src/host/cues.ts";
import { safeArea } from "@couchcade/stage/layout";
import { calloutAt, horizonY, pipSlots, street } from "../../src/host/layout.ts";
import { crowShowMs, formatReaction, present } from "../../src/host/present.ts";
import type { Presentation } from "../../src/host/present.ts";
import { fakeWordShowMs, glintShowMs, init } from "../../src/shared/index.ts";
import type { Fake, QuickDrawState } from "../../src/shared/index.ts";
import { botRoom, mixedBots, rotatingBots, seedWithEveryFake } from "./bots.ts";

const players = createPlayers(4);
const options = { reducedMotion: false };

/** A standoff at game time `nowMs` with the given fakes, DRAW! due at 9,000 ms. */
function standoffAt(nowMs: number, fakes: Fake[]): QuickDrawState {
  return {
    ...init(players, 1),
    phase: "standoff",
    round: 2,
    nowMs,
    phaseAtMs: 1500,
    drawDueMs: 9000,
    fakes,
  };
}

const word: Fake = { atMs: 3000, kind: "word", word: "DRIP!", playerId: null };
const crow: Fake = { atMs: 5000, kind: "crow", word: null, playerId: null };
const glint: Fake = { atMs: 7000, kind: "glint", word: null, playerId: players[1]?.id ?? null };

describe("layout", () => {
  it("puts 2 players at x = 150 and x = 330, facing each other", () => {
    expect(pipSlots(2)).toEqual([
      { x: 150, feetY: 200, facing: 1, row: 0 },
      { x: 330, feetY: 200, facing: -1, row: 0 },
    ]);
  });

  it("puts even slots left and odd slots right, 12 px further back per row, inside the world", () => {
    const slots = pipSlots(8);
    expect(
      slots.filter((_, i) => i % 2 === 0).every((slot) => slot.x <= 150 && slot.facing === 1),
    ).toBe(true);
    expect(
      slots.filter((_, i) => i % 2 === 1).every((slot) => slot.x >= 330 && slot.facing === -1),
    ).toBe(true);
    expect(slots.map((slot) => slot.feetY)).toEqual([200, 200, 188, 188, 176, 176, 164, 164]);
    for (const slot of slots) {
      expect(Number.isInteger(slot.x) && Number.isInteger(slot.feetY)).toBe(true);
      expect(slot.x).toBeGreaterThanOrEqual(24 + 8);
      expect(slot.x).toBeLessThanOrEqual(world.width - 24 - 8);
    }
  });

  it("keeps the street, the Pips and the callout between the scoreboard and the bottom panels", () => {
    // The stage scoreboard is 18 world px high plus its lift, outline and shadow; the bottom row
    // (instruction and room code panels) is the bottom 15% of the TV.
    const scoreboardBottom = safeArea.top + 24;
    const bottomRowTop = safeArea.bottom - 40;
    expect(horizonY).toBeLessThanOrEqual(world.height / 3);
    expect(calloutAt.y - 25).toBeGreaterThan(scoreboardBottom);
    expect(street.top).toBeGreaterThan(horizonY);
    expect(street.top + street.rows * 16).toBeLessThanOrEqual(bottomRowTop);
    for (const slot of pipSlots(8)) {
      // The Pip (24 px), its tag above and its shape marker (9 px) below.
      expect(slot.feetY - 24 - 16).toBeGreaterThan(calloutAt.y);
      expect(slot.feetY + 9).toBeLessThanOrEqual(bottomRowTop);
    }
  });
});

describe("present", () => {
  it("shows a fake word in the DRAW! callout spot for 600 ms, and never two callouts", () => {
    expect(present(standoffAt(2990, [word]), options).callout).toBeNull();
    expect(present(standoffAt(3000, [word]), options).callout).toEqual({
      text: "DRIP!",
      kind: "fake",
      ageMs: 0,
    });
    expect(present(standoffAt(3000 + fakeWordShowMs - tickMs, [word]), options).callout?.text).toBe(
      "DRIP!",
    );
    expect(present(standoffAt(3000 + fakeWordShowMs, [word]), options).callout).toBeNull();
  });

  it("lands the crow and flaps once, with no flapping on reduced motion", () => {
    const frames = [5000, 5100, 5200, 5300, 5500].map(
      (ms) => present(standoffAt(ms, [crow]), options).crow?.frame,
    );
    expect(frames).toEqual([0, 1, 2, 0, 0]);
    expect(present(standoffAt(5100, [crow]), { ...options, reducedMotion: true }).crow).toEqual({
      frame: 0,
    });
    expect(present(standoffAt(5000 + crowShowMs, [crow]), options).crow).toBeNull();
  });

  it("sparkles one popgun for 300 ms, without twinkling on reduced motion", () => {
    expect(present(standoffAt(7000, [glint]), options).glint).toEqual({
      playerId: glint.playerId,
      frame: 0,
    });
    expect(present(standoffAt(7200, [glint]), options).glint?.frame).toBe(2);
    expect(
      present(standoffAt(7200, [glint]), { ...options, reducedMotion: true }).glint?.frame,
    ).toBe(1);
    expect(present(standoffAt(7000 + glintShowMs, [glint]), options).glint).toBeNull();
    // Fakes are world animations, so DRAW! is never hidden behind them.
    expect(present(standoffAt(7000, [glint]), options).callout).toBeNull();
  });

  it("follows a round from intro to result with the spec's panel lines", () => {
    const bots = botRoom(4, 1, mixedBots);
    const seen: Array<{ phase: string; view: Presentation }> = [];
    let state = bots.step();
    while (state.round === 1) {
      seen.push({ phase: state.phase, view: present(state, options) });
      state = bots.step();
    }
    const inPhase = (phase: string) =>
      seen.filter((entry) => entry.phase === phase).map((entry) => entry.view);
    const panels = (phase: string) => new Set(inPhase(phase).map((view) => view.panel));
    const labels = new Set(
      seen.flatMap(({ phase, view }) =>
        view.pips.flatMap((pip) => (pip.label ? [`${phase}:${pip.label.text}`] : [])),
      ),
    );

    expect(panels("intro")).toEqual(new Set(["Tap your phone when the TV shouts DRAW"]));
    expect(panels("standoff")).toEqual(new Set(["Wait for it…"]));
    expect(panels("result")).toEqual(new Set(["Player 1 wins the round"]));
    expect(inPhase("intro").every((view) => view.tumbleweed !== null)).toBe(true);
    expect(new Set(inPhase("draw").map((view) => view.callout?.text))).toEqual(new Set(["DRAW!"]));
    const results = inPhase("result");
    expect(results.every((view) => view.callout === null)).toBe(true);
    expect(new Set(results.map((view) => view.pips.map((pip) => pip.expression).join()))).toEqual(
      new Set(["happy,surprised,surprised,surprised"]),
    );
    expect(results.every((view) => view.pips[0]?.flag !== null)).toBe(true);
    expect(results.every((view) => view.pips.slice(1).every((pip) => pip.flag === null))).toBe(
      true,
    );
    // FOUL! over the fouling Pip right away; times only with the result.
    expect(labels).toEqual(
      new Set([
        "standoff:FOUL!",
        "draw:FOUL!",
        "result:0.243",
        "result:0.301",
        "result:FOUL!",
        "result:-.---",
      ]),
    );
    expect(present(state, options).panel).toBe("Watch out for fakes");
  });

  it("keeps the Pips neutral during the standoff and never sad at a foul", () => {
    const bots = botRoom(4, 1, mixedBots);
    let state = bots.step();
    while (state.phase !== "result") {
      for (const pip of present(state, options).pips) expect(pip.expression).toBe("neutral");
      state = bots.step();
    }
  });

  it("names every winner of a tie and says when nobody won", () => {
    const base = { ...init(players, 1), phase: "result" as const };
    const names = (winners: string[]) => present({ ...base, winners }, options).panel;
    const ids = players.map((player) => player.id);
    expect(names([])).toBe("No winner this round");
    expect(names(ids.slice(0, 2))).toBe("Player 1 and Player 2 win the round");
    expect(names(ids.slice(0, 3))).toBe("Player 1, Player 2 and Player 3 win the round");
  });

  it("formats reaction times as seconds with three decimals", () => {
    expect(formatReaction(243)).toBe("0.243");
    expect(formatReaction(1500)).toBe("1.500");
  });

  it("is the same for the same state", () => {
    const state = standoffAt(3100, [word, crow]);
    expect(present(state, options)).toEqual(present(structuredClone(state), options));
  });
});

/** Every cue of a match, rendering every `framesPerTick`-th tick like a slow TV would. */
function matchCues(seed: number, framesPerTick: number): QuickDrawCue[] {
  const bots = botRoom(8, seed, rotatingBots);
  let previous: QuickDrawState | null = null;
  const cues: QuickDrawCue[] = [];
  for (let tick = 1; !bots.room.over; tick++) {
    const state = bots.step();
    if (tick % framesPerTick !== 0 && !bots.room.over) continue;
    cues.push(...cuesBetween(previous, state));
    previous = state;
  }
  return cues;
}

describe("cues", () => {
  it("marks each round, standoff, fake, DRAW!, foul and result exactly once", () => {
    const seed = seedWithEveryFake(8, rotatingBots);
    const cues = matchCues(seed, 1);
    const count = (type: QuickDrawCue["type"]) => cues.filter((cue) => cue.type === type).length;
    expect(count("round")).toBe(9);
    expect(count("standoff")).toBe(9);
    expect(count("draw")).toBe(9);
    expect(count("result")).toBe(9);
    expect(count("foul")).toBe(9);
    expect(count("over")).toBe(1);
    expect(new Set(cues.flatMap((cue) => (cue.type === "fake" ? [cue.kind] : [])))).toEqual(
      new Set(["word", "crow", "glint"]),
    );
    const firstResult = cues.find((cue) => cue.type === "result");
    expect(firstResult).toMatchObject({ round: 1, winners: [players[0]?.id] });
  });

  it("gives the same cues on a TV that renders every third tick", () => {
    const seed = seedWithEveryFake(8, rotatingBots);
    expect(matchCues(seed, 3)).toEqual(matchCues(seed, 1));
  });
});
