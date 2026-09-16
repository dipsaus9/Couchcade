import { color, players as playerTokens } from "@couchcade/theme";
import { describe, expect, it } from "vitest";
import { metrics, safeArea } from "../src/layout/index.ts";
import { StageScene } from "../src/scene/index.ts";
import { scoreboardMetrics } from "../src/scoreboard/index.ts";
import type { Scoreboard, ScoreboardChip } from "../src/scoreboard/index.ts";
import { boot, expectedColour, hex, pixel, player } from "./boot.ts";

// Listed out of join order, with an audience member who never gets a chip.
const room = [
  player("noor", "Noor", 1, 2_000),
  player("mees", "Mees", null, 1_500),
  player("sam", "Sam", 0, 1_000),
  player("lotte", "Lotte", 3, 4_000),
  player("jesse", "Jesse", 2, 3_000),
  player("daan", "Daan", 4, 5_000),
];

const centreX = (c: ScoreboardChip) => Math.floor(c.bounds.x + c.bounds.width / 2);

function chip(scoreboard: Scoreboard, id: string): ScoreboardChip {
  const found = scoreboard.chips.find((c) => c.playerId === id);
  if (!found) throw new Error(`No chip for ${id}`);
  return found;
}

describe("Scoreboard", () => {
  it("shows seated players in join order with their shape and score", async () => {
    const { game, scene } = await boot(StageScene);
    const scoreboard = scene.addScoreboard({
      players: room,
      scores: { sam: 3, noor: 12, jesse: 0, lotte: 7, daan: 2 },
      round: { current: 2, total: 5 },
    });
    expect(scene.overlay.list).toContain(scoreboard);
    expect(scoreboard.chips.map((c) => c.playerId)).toEqual([
      "sam",
      "noor",
      "jesse",
      "lotte",
      "daan",
    ]);

    const xs = scoreboard.chips.map((c) => c.bounds.x);
    expect(xs).toEqual(xs.toSorted((a, b) => a - b));

    for (const [id, slot] of [
      ["sam", 0],
      ["noor", 1],
      ["jesse", 2],
      ["lotte", 3],
      ["daan", 4],
    ] as const) {
      const { bounds } = chip(scoreboard, id);
      // The centre of the 9×9 shape carries the player's colour, Ink around it, Chalk around that.
      const shapeX = bounds.x + scoreboardMetrics.padStart;
      const shapeY = bounds.y + Math.floor((bounds.height - 9) / 2);
      const token = playerTokens[slot];
      expect(hex(await pixel(game, shapeX + 4, shapeY + 4)), `${id} shape`).toBe(
        expectedColour(token.color),
      );
      expect(hex(await pixel(game, bounds.x + 2, bounds.y + bounds.height / 2)), `${id} fill`).toBe(
        expectedColour(color.chalk),
      );
      expect(hex(await pixel(game, bounds.x, bounds.y + bounds.height / 2)), `${id} outline`).toBe(
        expectedColour(color.ink),
      );
    }
  });

  it("centres the row in the safe area with the round counter in the middle", async () => {
    const { scene } = await boot(StageScene);
    const scoreboard = scene.addScoreboard({ players: room, round: { current: 2, total: 5 } });
    const counter = scoreboard.roundCounterBounds;
    expect(counter).not.toBeNull();
    if (!counter) return;
    const [first, second, third, fourth, fifth] = scoreboard.chips.map((c) => c.bounds);
    for (const left of [first, second, third])
      expect(left!.x + left!.width).toBeLessThan(counter.x);
    for (const right of [fourth, fifth])
      expect(right!.x).toBeGreaterThan(counter.x + counter.width);
    const before = first!.x - safeArea.left;
    const after = safeArea.right - (fifth!.x + fifth!.width);
    expect(Math.abs(before - after)).toBeLessThanOrEqual(1);
    expect(scoreboard.chips.map((c) => c.name)).toEqual(["Sam", "Noor", "Jesse", "Lotte", "Daan"]);
  });

  it("lifts the active player's chip by 8 TV pixels and rings it in Sunny", async () => {
    const { game, scene } = await boot(StageScene);
    const scoreboard = scene.addScoreboard({ players: room, activePlayerId: "jesse" });
    const active = chip(scoreboard, "jesse");
    const idle = chip(scoreboard, "noor");
    expect(active.active).toBe(true);
    expect(idle.active).toBe(false);
    expect(idle.bounds.y - active.bounds.y).toBe(scoreboardMetrics.lift);

    const ringY = active.bounds.y - metrics.outline;
    expect(hex(await pixel(game, centreX(active), ringY))).toBe(expectedColour(color.sunny));
    expect(hex(await pixel(game, centreX(active), active.bounds.y))).toBe(
      expectedColour(color.ink),
    );
    expect(hex(await pixel(game, centreX(idle), idle.bounds.y - metrics.outline))).toBe(
      expectedColour(color.sky),
    );

    scoreboard.setActivePlayer("noor");
    expect(chip(scoreboard, "noor").bounds.y).toBe(active.bounds.y);
    expect(chip(scoreboard, "jesse").bounds.y).toBe(idle.bounds.y);
    expect(hex(await pixel(game, centreX(chip(scoreboard, "noor")), ringY))).toBe(
      expectedColour(color.sunny),
    );
  });

  it("fits eight players with long names inside the top of the safe area", async () => {
    const { game, scene } = await boot(StageScene);
    const full = playerTokens.map((_, slot) =>
      player(`p${slot}`, `Player${slot}abcde`.slice(0, 12), slot, slot),
    );
    const scores = Object.fromEntries(full.map((p, i) => [p.id, 100 + i]));
    const scoreboard = scene.addScoreboard({
      players: full,
      scores,
      activePlayerId: "p7",
      round: { current: 10, total: 10 },
    });
    expect(scoreboard.chips).toHaveLength(8);
    for (const c of scoreboard.chips) {
      const slot = Number(c.playerId.slice(1));
      const shapeX = c.bounds.x + scoreboardMetrics.padStart;
      const shapeY = c.bounds.y + Math.floor((c.bounds.height - 9) / 2);
      expect(hex(await pixel(game, shapeX + 4, shapeY + 4)), `${c.playerId} shape`).toBe(
        expectedColour(playerTokens[slot]!.color),
      );
      expect(c.bounds.x).toBeGreaterThanOrEqual(safeArea.left + metrics.outline);
      expect(c.bounds.x + c.bounds.width).toBeLessThanOrEqual(safeArea.right - metrics.outline);
      expect(c.bounds.y - metrics.outline).toBeGreaterThanOrEqual(safeArea.top);
      expect(c.name === "" || c.name.endsWith("…")).toBe(true);
    }
    const bottom = Math.max(...scoreboard.chips.map((c) => c.bounds.y + c.bounds.height));
    // The scoreboard row is the top 14% of the screen.
    expect(bottom + metrics.depth).toBeLessThanOrEqual(Math.floor(270 * 0.14));
    const sorted = scoreboard.chips.map((c) => c.bounds).toSorted((a, b) => a.x - b.x);
    sorted.slice(1).forEach((b, i) => {
      const previous = sorted[i]!;
      expect(b.x).toBeGreaterThanOrEqual(previous.x + previous.width + 2 * metrics.outline);
    });
  });

  it("updates scores and players without rebuilding when nothing changed", async () => {
    const { scene } = await boot(StageScene);
    const scoreboard = scene.addScoreboard({ players: room, scores: { sam: 1 } });
    const children = [...scoreboard.list];
    scoreboard.setScores({ sam: 1 }).setActivePlayer(null).setRound(null);
    expect(scoreboard.list).toEqual(children);

    scoreboard.setScore("sam", 2);
    expect(scoreboard.list).not.toEqual(children);
    scoreboard.setPlayers(room.filter((p) => p.id !== "daan"));
    expect(scoreboard.chips.map((c) => c.playerId)).not.toContain("daan");
  });
});
