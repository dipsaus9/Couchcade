import { describe, expect, it } from "vitest";
import { createPlayers } from "@couchcade/game-sdk/testing";
import type { Player } from "@couchcade/game-sdk/contract";
import game from "../src/index.ts";
import { present as presentPhone } from "../src/controller/present.ts";
import { panelText } from "../src/host/present.ts";
import {
  init,
  maxRounds,
  onPlayerLeft,
  restore,
  snapshot,
  targetPoints,
} from "../src/shared/index.ts";
import type { QuickDrawResultView, QuickDrawState } from "../src/shared/index.ts";
import { room, stepUntil, tapAt } from "./helpers.ts";
import type { QuickDrawRoom } from "./helpers.ts";

// Solo practice (docs/games/quick-draw.md, "Solo practice"): one player, no opponent, playing
// against their own best reaction time.

const [solo, second] = createPlayers(2) as [Player, Player];

/**
 * Plays one round of `target`: taps `reactionMs` after DRAW! is due (negative is before it), or
 * never for null. Returns the state on the round's first `result` tick.
 */
function playRound(target: QuickDrawRoom, reactionMs: number | null): QuickDrawState {
  const standoff = stepUntil(target, "standoff");
  if (reactionMs !== null && standoff.drawDueMs !== null) {
    tapAt(target, solo.id, standoff.drawDueMs + reactionMs);
  }
  return stepUntil(target, "result");
}

/** The phone's result data in `state`. */
function resultData(state: QuickDrawState): QuickDrawResultView {
  const { screen, data } = game.view(state, solo);
  expect(screen).toBe("qd-result");
  return data as QuickDrawResultView;
}

describe("solo practice", () => {
  it("lets one player start Quick Draw", () => {
    expect(game.players).toEqual({ min: 1, max: 8 });
    expect(init([solo], 3).practice).toEqual({ totalMs: 0, validTaps: 0, newBest: false });
    // Two or more players get the approved match, with no practice data at all.
    expect(init([solo, second], 3)).not.toHaveProperty("practice");
  });

  it("scores every valid tap and marks a time that beats the best", () => {
    const target = room([solo], 8);

    const first = playRound(target, 300);
    expect(first.winners).toEqual([solo.id]);
    expect(first.players[0]).toMatchObject({ points: 1, bestMs: 300 });
    expect(first.practice).toEqual({ totalMs: 300, validTaps: 1, newBest: true });
    expect(panelText(first)).toBe("New best: 0.300");

    const slower = playRound(target, 400);
    expect(slower.players[0]).toMatchObject({ points: 2, bestMs: 300 });
    expect(slower.practice).toEqual({ totalMs: 700, validTaps: 2, newBest: false });
    expect(panelText(slower)).toBe("0.400, best 0.300");
    expect(resultData(slower).practice).toEqual({
      newBest: false,
      bestMs: 300,
      averageMs: 350,
      final: false,
    });
  });

  it("costs only the round on a foul or no tap", () => {
    const target = room([solo], 8);
    playRound(target, 250);

    const foul = playRound(target, -500);
    expect(foul.winners).toEqual([]);
    expect(foul.players[0]).toMatchObject({ points: 1, bestMs: 250 });
    expect(foul.practice).toEqual({ totalMs: 250, validTaps: 1, newBest: false });
    expect(panelText(foul)).toBe("No time this round");
    expect(resultData(foul)).toMatchObject({
      result: "foul",
      practice: { newBest: false, bestMs: 250, averageMs: 250, final: false },
    });

    const slow = playRound(target, null);
    expect(slow.players[0]?.result?.kind).toBe("slow");
    expect(panelText(slow)).toBe("No time this round");
  });

  it("has fakes from round 2, like a match", () => {
    let seed = 0;
    let fakes = 0;
    for (; seed < 200 && fakes === 0; seed++) {
      const target = room([solo], seed);
      const round1 = stepUntil(target, "standoff");
      expect(round1.fakes).toEqual([]);
      fakes = playRoundAndNextStandoff(target).fakes.length;
    }
    expect(fakes).toBeGreaterThan(0);
  });

  it("ends after the round with 3 points and shows the best and average", () => {
    const target = room([solo], 21);
    playRound(target, 320);
    playRound(target, 280);
    const last = playRound(target, 330);
    expect(last.players[0]?.points).toBe(targetPoints);
    expect(panelText(last)).toBe("Best 0.280 · average 0.310");
    expect(resultData(last).practice).toEqual({
      newBest: false,
      bestMs: 280,
      averageMs: 310,
      final: true,
    });

    stepUntil(target, "over");
    expect(game.outcome(target.state)).toEqual({
      placements: [{ playerId: solo.id, place: 1, score: 3 }],
    });
  });

  it("ends after round 9 when the player never gets 3 points", () => {
    const target = room([solo], 5);
    let state = playRound(target, 260);
    for (let round = 2; round <= maxRounds; round++) state = playRound(target, -400);
    expect(state.round).toBe(maxRounds);
    expect(panelText(state)).toBe("Best 0.260 · average 0.260");
    stepUntil(target, "over");
    expect(game.outcome(target.state)?.placements).toEqual([
      { playerId: solo.id, place: 1, score: 1 },
    ]);
  });

  it("ends when the player leaves", () => {
    const state = onPlayerLeft(init([solo], 1), solo);
    expect(state.phase).toBe("over");
  });

  it("keeps the best and average across a TV refresh", () => {
    const target = room([solo], 13);
    playRound(target, 240);
    const saved = snapshot(playRound(target, 360));
    expect(saved.practice).toEqual([600, 2]);

    const restored = restore([solo], 13, JSON.parse(JSON.stringify(saved)));
    expect(restored).toMatchObject({ phase: "intro", round: 3 });
    expect(restored.players[0]).toMatchObject({ points: 2, bestMs: 240 });
    expect(restored.practice).toEqual({ totalMs: 600, validTaps: 2, newBest: false });

    // A match with two players has no practice data to save.
    expect(snapshot(init([solo, second], 13))).not.toHaveProperty("practice");
  });

  it("tells the phone about a new best, and the best and average on the last round", () => {
    const base = { round: 2, target: 3 as const, points: 2, ms: 243, winner: "Player 1" };
    const newBest = presentPhone(
      "qd-result",
      {
        ...base,
        result: "won",
        practice: { newBest: true, bestMs: 243, averageMs: 270, final: false },
      },
      true,
      false,
    );
    expect(newBest).toMatchObject({
      statusLine: "New best!",
      hint: "0.243 s · 2 points",
      cue: "celebrate",
    });

    const notBest = presentPhone(
      "qd-result",
      {
        ...base,
        result: "won",
        ms: 301,
        practice: { newBest: false, bestMs: 243, averageMs: 272, final: false },
      },
      true,
      false,
    );
    expect(notBest).toMatchObject({
      statusLine: "Your best is 0.243 s",
      hint: "0.301 s · 2 points",
    });

    const lastFoul = presentPhone(
      "qd-result",
      {
        ...base,
        result: "foul",
        ms: null,
        practice: { newBest: false, bestMs: 243, averageMs: 272, final: true },
      },
      true,
      false,
    );
    expect(lastFoul).toMatchObject({
      statusLine: "Too early, that's a foul",
      hint: "Best 0.243 s · average 0.272 s",
      cue: "foul",
    });
    for (const shown of [newBest, notBest, lastFoul]) {
      expect(shown.statusLine.length).toBeLessThanOrEqual(40);
      expect(shown.hint.length).toBeLessThanOrEqual(40);
    }
  });
});

/** Plays round 1 without a tap and returns round 2's standoff. */
function playRoundAndNextStandoff(target: QuickDrawRoom): QuickDrawState {
  playRound(target, null);
  return stepUntil(target, "standoff", 2);
}
