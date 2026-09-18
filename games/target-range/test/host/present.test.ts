import { describe, expect, it } from "vitest";
import { tickMs } from "@couchcade/game-sdk/contract";
import { createPlayers } from "@couchcade/game-sdk/testing";
import { SHAPE_SIZE } from "@couchcade/stage/draw";
import { world } from "@couchcade/theme";
import { createCrosshairPlayback } from "../../src/host/aim-playback.ts";
import {
  calloutAt,
  crosshairShapeBox,
  flagFoot,
  flagFrame,
  panelTopY,
  pipFeetY,
  pipSlots,
  scoreboardBottomY,
  stand,
  standAt,
} from "../../src/host/layout.ts";
import { panelText, present, targetSlideMs, windText } from "../../src/host/present.ts";
import type { Presentation } from "../../src/host/present.ts";
import {
  aimPoint,
  init,
  pitchPx,
  rounds,
  targetMaxX,
  targetMaxY,
  targetMinX,
  targetMinY,
  volleyMs,
  volleyOf,
} from "../../src/shared/index.ts";
import type { Arrow, TargetRangeState } from "../../src/shared/index.ts";
import { tickUntil } from "../helpers.ts";
import { botRoom, spreadBots } from "./bots.ts";

const players = createPlayers(4);
const options = { reducedMotion: false };

/** A state in `phase` with the players' results and points set. */
function withPlayers(
  state: TargetRangeState,
  change: (index: number) => Partial<TargetRangeState["players"][number]>,
): TargetRangeState {
  return { ...state, players: state.players.map((player, i) => ({ ...player, ...change(i) })) };
}

const arrow = (playerId: string, change: Partial<Arrow> = {}): Arrow => ({
  playerId,
  volley: 1,
  atMs: 3000,
  aim: { yaw: 0, pitch: 0 },
  power: 1,
  x: 240,
  y: 140,
  flightMs: 350,
  landsAtMs: 3350,
  points: 7,
  landed: false,
  ...change,
});

describe("layout", () => {
  it("puts even seats in the front left corner and odd seats in the front right, nearest the middle first", () => {
    const slots = pipSlots(8);
    expect(slots.map((slot) => slot.x)).toEqual([104, 376, 80, 400, 56, 424, 32, 448]);
    for (const [index, slot] of slots.entries()) {
      expect(slot.facing).toBe(index % 2 === 0 ? 1 : -1);
      expect(slot.feetY).toBe(pipFeetY);
      // Inside the TV safe area (24 world px) and clear of the target's widest spot.
      expect(slot.x - 8).toBeGreaterThanOrEqual(24);
      expect(slot.x + 8).toBeLessThanOrEqual(world.width - 24);
      expect(slot.x + 8 < targetMinX - stand.faceX || slot.x - 8 > targetMaxX + stand.faceX).toBe(
        true,
      );
    }
    // The shape marker under the feet ends above the bottom panels.
    expect(pipFeetY + SHAPE_SIZE).toBeLessThanOrEqual(panelTopY);
  });

  it("keeps every target face between y = 60 and 210 and its boss and flag clear of the overlays", () => {
    for (const round of rounds) {
      for (const [x, y] of [
        [targetMinX, targetMinY],
        [targetMaxX, targetMaxY],
        [targetMinX, targetMaxY],
        [targetMaxX, targetMinY],
      ] as const) {
        expect(y - round.radius).toBeGreaterThanOrEqual(60);
        expect(y + round.radius).toBeLessThanOrEqual(210);
        // The straw boss stays above the bottom panels; only the stand's legs may reach behind them.
        const at = standAt({ x, y });
        expect(at.y + stand.bossHeight).toBeLessThanOrEqual(panelTopY);
        expect(at.x).toBeGreaterThanOrEqual(24);
        expect(at.x + stand.width).toBeLessThanOrEqual(world.width - 24);
        // The flag stands in the straw on top of the boss, below the scoreboard.
        const foot = flagFoot({ x, y });
        expect(foot.y).toBeGreaterThan(at.y);
        expect(foot.y - flagFrame.poleBottom).toBeGreaterThanOrEqual(scoreboardBottomY);
        const callout = calloutAt({ x, y });
        expect(callout.x - 100).toBeGreaterThanOrEqual(24);
        expect(callout.x + 100).toBeLessThanOrEqual(world.width - 24);
      }
    }
  });

  it("keeps a crosshair's shape below the scoreboard at the highest aim", () => {
    const top = aimPoint({ yaw: 1, pitch: 1 });
    expect(top.y).toBe(140 - pitchPx);
    expect(crosshairShapeBox(top).top).toBeGreaterThanOrEqual(scoreboardBottomY);
  });
});

describe("panel", () => {
  const state = init(players, 1);

  it("teaches the controls in round 1 and names the round after that", () => {
    expect(panelText(state)).toBe("Point at the TV, pull down, let go");
    expect(panelText({ ...state, round: 3 })).toBe("Round 3 of 4: far");
  });

  it("shows the arrow and the wind while a volley is open", () => {
    const open = { ...state, phase: "open" as const, arrow: 2, winds: [0, -3, 2] };
    expect(panelText(open)).toBe("Arrow 2 of 3, wind 3 to the left");
    expect(panelText({ ...open, arrow: 3, phase: "landing" })).toBe(
      "Arrow 3 of 3, wind 2 to the right",
    );
    expect(windText(0)).toBe("No wind");
  });

  it("names the best arrow at the reveal, or blames the wind when nobody scored", () => {
    const reveal = { ...state, phase: "reveal" as const };
    const results = [8, 3, "late", "none"] as const;
    expect(panelText(withPlayers(reveal, (i) => ({ result: results[i] ?? null })))).toBe(
      "Player 1 hit an 8",
    );
    expect(panelText(withPlayers(reveal, (i) => ({ result: i < 2 ? 10 : 0 })))).toBe(
      "Player 1 and Player 2 hit a 10",
    );
    expect(panelText(withPlayers(reveal, () => ({ result: 0 })))).toBe("Tricky wind, that one");
  });

  it("names the leader after a round and the winner at the end", () => {
    const points = [52, 40, 52, 3];
    const scored = withPlayers(state, (i) => ({ points: points[i] ?? 0 }));
    expect(panelText({ ...scored, phase: "roundEnd" })).toBe("Player 1 and Player 3 lead with 52");
    expect(panelText({ ...scored, phase: "over" })).toBe("Player 1 and Player 3 win with 52");
    expect(panelText({ ...state, phase: "roundEnd" })).toBe("Nobody has scored yet");
  });
});

describe("present", () => {
  const opened = tickUntil(init(players, 1), "open");
  const id = (index: number) => opened.players[index]?.id ?? "";

  it("is a pure function of the state", () => {
    expect(present(opened, options)).toEqual(present(structuredClone(opened), options));
  });

  it("threads whatever crosshairs it's given straight through, in the order given", () => {
    const crosshairs = [
      { id: id(2), x: 10, y: 20 },
      { id: id(0), x: 30, y: 40 },
    ];
    expect(present(opened, { ...options, crosshairs }).crosshairs).toEqual(crosshairs);
    // Defaults to none, such as before the scene has a frame to play back.
    expect(present(opened, options).crosshairs).toEqual([]);
  });

  it("flies an arrow from its Pip's bow and sticks it where it lands, wobbling for 2 frames", () => {
    const shot = arrow(id(1));
    const flying = present({ ...opened, nowMs: 3000, arrows: [shot] }, options);
    expect(flying.stuck).toEqual([]);
    expect(flying.flying).toHaveLength(1);
    const bow = pipSlots(4)[1];
    expect(flying.flying[0]).toMatchObject({ id: id(1), size: 2, facing: -1 });
    expect(Math.abs((flying.flying[0]?.x ?? 0) - ((bow?.x ?? 0) - 9))).toBeLessThanOrEqual(1);

    const landing = (nowMs: number, reducedMotion = false) =>
      present({ ...opened, nowMs, arrows: [{ ...shot, landed: true }] }, { reducedMotion }).stuck;
    expect(landing(3350)).toEqual([{ id: id(1), x: 241, y: 140, newest: true }]);
    expect(landing(3450)[0]?.x).toBe(239);
    expect(landing(3550)[0]?.x).toBe(240);
    expect(landing(3350, true)[0]?.x).toBe(240);
  });

  it("shows only the stub for arrows of earlier volleys and pulls every arrow at the round's end", () => {
    const state = {
      ...opened,
      arrow: 2,
      nowMs: 20_000,
      arrows: [arrow(id(0), { landed: true }), arrow(id(0), { volley: 2, landed: true, x: 250 })],
    };
    expect(present(state, options).stuck.map((stuck) => stuck.newest)).toEqual([false, true]);
    expect(present({ ...state, phase: "roundEnd" }, options).stuck).toEqual([]);
  });

  it("counts the volley clock down in whole seconds while it is open", () => {
    const openAtMs = opened.openAtMs as number;
    expect(present(opened, options).clock).toBe(10);
    expect(present({ ...opened, nowMs: openAtMs + 7_100 }, options).clock).toBe(3);
    expect(present({ ...opened, nowMs: openAtMs + volleyMs - 10 }, options).clock).toBe(1);
    expect(present({ ...opened, phase: "landing" }, options).clock).toBeNull();
  });

  it("pops every player's points at the reveal, with BULLSEYE! only when someone hit a 10", () => {
    const results = [10, 4, "late", 0] as const;
    const reveal = withPlayers({ ...opened, phase: "reveal", phaseAtMs: opened.nowMs }, (i) => ({
      result: results[i] ?? null,
    }));
    const view = present(reveal, options);
    expect(view.tags.map(({ text, tone, pop }) => ({ text, tone, pop }))).toEqual([
      { text: "10", tone: "bullseye", pop: 0 },
      { text: "4", tone: "hit", pop: 0 },
      { text: "LATE", tone: "miss", pop: 0 },
      { text: "MISS", tone: "miss", pop: 0 },
    ]);
    expect(view.callout).toMatchObject({ text: "BULLSEYE!", key: "bullseye:1" });
    expect(present(reveal, { reducedMotion: true }).tags.every((tag) => tag.pop === 1)).toBe(true);
    const noTen = withPlayers(reveal, () => ({ result: 9 }));
    expect(present(noTen, options).callout).toBeNull();
    // Pips with a 9 or 10 look happy, Pips that missed look surprised.
    expect(view.pips.map((pip) => pip.expression)).toEqual([
      "happy",
      "neutral",
      "neutral",
      "surprised",
    ]);
  });

  it("slides the target from last round's spot during the intro, and not with reduced motion", () => {
    const intro = { ...init(players, 1), round: 2, target: { x: 300, y: 150 } };
    const from = { x: 200, y: 110 };
    const at = (nowMs: number, reducedMotion = false) =>
      present({ ...intro, nowMs }, { reducedMotion, previousTarget: from }).target;
    expect(at(0)).toMatchObject(from);
    expect(at(targetSlideMs / 2)).toMatchObject({ x: 250, y: 130 });
    expect(at(targetSlideMs)).toMatchObject({ x: 300, y: 150 });
    expect(at(0, true)).toMatchObject({ x: 300, y: 150 });
  });

  it("lists the round's arrows between rounds, most points first", () => {
    const state = withPlayers(
      {
        ...opened,
        phase: "roundEnd",
        arrow: 3,
        arrows: [
          arrow(id(1), { volley: 1, points: 9 }),
          arrow(id(1), { volley: 3, points: 10 }),
          arrow(id(0), { volley: 2, points: 3 }),
        ],
      },
      (i) => ({ points: [3, 19, 0, 0][i] ?? 0 }),
    );
    const { results } = present(state, options) as Presentation & {
      results: NonNullable<Presentation["results"]>;
    };
    expect(results.title).toBe("Scores after round 1 of 4");
    expect(
      results.rows.map(({ id: row, arrows, roundPoints, points }) => [
        row,
        arrows,
        roundPoints,
        points,
      ]),
    ).toEqual([
      [id(1), [9, null, 10], 19, 19],
      [id(0), [null, 3, null], 3, 3],
      [id(2), [null, null, null], 0, 0],
      [id(3), [null, null, null], 0, 0],
    ]);
  });

  it("keeps a whole 8-player bot match inside the world, with at most one crosshair and arrow per seat", () => {
    const bots = botRoom(8, 2, spreadBots);
    const crosshairPlayback = createCrosshairPlayback();
    const seen = new Set<string>();
    while (!bots.room.over) {
      const state = bots.step();
      const crosshairs = crosshairPlayback.at(state, tickMs, () => 0);
      const view = present(state, { ...options, crosshairs });
      for (const crosshair of view.crosshairs) {
        expect(crosshair.x).toBeGreaterThanOrEqual(0);
        expect(crosshair.x).toBeLessThan(world.width);
        expect(crosshair.y).toBeGreaterThanOrEqual(0);
        expect(crosshair.y).toBeLessThan(world.height);
      }
      expect(new Set(view.crosshairs.map((c) => c.id)).size).toBe(view.crosshairs.length);
      expect(new Set(view.flying.map((f) => f.id)).size).toBe(view.flying.length);
      expect(view.stuck.filter((s) => s.newest)).toHaveLength(
        new Set(view.stuck.filter((s) => s.newest).map((s) => s.id)).size,
      );
      if (view.crosshairs.length > 0) seen.add(`crosshairs:${view.crosshairs.length}`);
      if (view.flying.length > 0) seen.add("flying");
      if (view.callout) seen.add("bullseye");
      if (view.results) seen.add(`results:${state.round}`);
      if (state.phase === "reveal") seen.add(`reveal:${volleyOf(state)}`);
    }
    expect(seen).toContain("crosshairs:8");
    expect(seen).toContain("flying");
    expect(seen).toContain("bullseye");
    for (const round of [1, 2, 3, 4]) expect(seen).toContain(`results:${round}`);
    expect([...seen].filter((entry) => entry.startsWith("reveal:"))).toHaveLength(12);
  });
});
