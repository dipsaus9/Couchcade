import { describe, expect, it } from "vitest";
import { present } from "../../src/controller/present.ts";
import type {
  QuickDrawResultView,
  QuickDrawRoundView,
  QuickDrawScreen,
  QuickDrawView,
} from "../../src/shared/view.ts";

/**
 * Every controller state from docs/games/quick-draw.md, "Phone controller": the big action's
 * state and label, the status line, the hint, and the locally derived cue. Pure data, so this
 * needs no component and no clock.
 */

const maxLen = 40;

const watching: QuickDrawRoundView = { round: 1, target: 3, points: 0 };
const standoffRound1: QuickDrawRoundView = { round: 1, target: 3, points: 0 };
const standoffRound2: QuickDrawRoundView = { round: 2, target: 3, points: 1 };

const wonView: QuickDrawResultView = {
  round: 2,
  target: 3,
  points: 2,
  result: "won",
  ms: 243,
  winner: "Player 1",
};
const lostView: QuickDrawResultView = {
  round: 2,
  target: 3,
  points: 0,
  result: "lost",
  ms: 301,
  winner: "Noor",
};
const foulView: QuickDrawResultView = {
  round: 2,
  target: 3,
  points: 0,
  result: "foul",
  ms: null,
  winner: "Player 1",
};
const fooledView: QuickDrawResultView = {
  round: 3,
  target: 3,
  points: 0,
  result: "fooled",
  ms: null,
  winner: "Player 1",
};
const slowView: QuickDrawResultView = {
  round: 4,
  target: 3,
  points: 0,
  result: "slow",
  ms: null,
  winner: null,
};

describe("present", () => {
  it("shows qd-watch: waiting, the round status and the watch hint, with no cue", () => {
    expect(present("qd-watch", watching, true, false)).toEqual({
      state: "waiting",
      actionLabel: "Watch the TV",
      statusLine: "Round 1 · first to 3",
      hint: "Tap when the TV shouts DRAW",
    });
  });

  it("shows qd-standoff in round 1 as dont-tap with the your-turn cue", () => {
    expect(present("qd-standoff", standoffRound1, true, false)).toEqual({
      state: "dont-tap",
      actionLabel: "Wait for DRAW",
      statusLine: "Round 1 · first to 3",
      hint: "Tap anywhere at DRAW",
      cue: "your-turn",
    });
  });

  it("shows qd-standoff from round 2 as dont-tap with no cue", () => {
    expect(present("qd-standoff", standoffRound2, true, false)).toEqual({
      state: "dont-tap",
      actionLabel: "Wait for DRAW",
      statusLine: "Round 2 · first to 3",
      hint: "Tap anywhere at DRAW",
    });
  });

  it("falls back to qd-watch during qd-standoff before the clock has synced", () => {
    expect(present("qd-standoff", standoffRound1, false, false)).toEqual(
      present("qd-watch", standoffRound1, false, false),
    );
  });

  it("shows the local tapped state as disabled, regardless of round", () => {
    expect(present("qd-standoff", standoffRound1, true, true)).toEqual({
      state: "disabled",
      actionLabel: "—",
      statusLine: "Tapped!",
      hint: "Watch the TV",
    });
    expect(present("qd-standoff", standoffRound2, true, true)).toEqual({
      state: "disabled",
      actionLabel: "—",
      statusLine: "Tapped!",
      hint: "Watch the TV",
    });
  });

  it("lets the sync gate win over a stale local tapped flag: never disabled while unsynced", () => {
    // In practice a tap can't register before the clock has synced (the big action never reaches
    // dont-tap), so `tapped` can't really be true here; this only pins the safe precedence.
    expect(present("qd-standoff", standoffRound1, false, true)).toEqual(
      present("qd-watch", standoffRound1, false, true),
    );
  });

  it("shows qd-result, won with the reaction time, points and the celebrate cue", () => {
    expect(present("qd-result", wonView, true, true)).toEqual({
      state: "waiting",
      actionLabel: "Watch the TV",
      statusLine: "You won the round!",
      hint: "0.243 s · 2 points",
      cue: "celebrate",
    });
  });

  it("uses the singular 'point' for exactly 1 point", () => {
    const oneWin: QuickDrawResultView = { ...wonView, points: 1 };
    expect(present("qd-result", oneWin, true, true).hint).toBe("0.243 s · 1 point");
  });

  it("shows qd-result, lost with the winner's name and this player's own time, no cue", () => {
    const view = present("qd-result", lostView, true, true);
    expect(view.statusLine).toBe("Noor was faster");
    expect(view.hint).toBe("Your time 0.301 s");
    expect(view.cue).toBeUndefined();
  });

  it("falls back to 'Someone' when lost has no winner name", () => {
    const view: QuickDrawResultView = { ...lostView, winner: null };
    expect(present("qd-result", view, true, true).statusLine).toBe("Someone was faster");
  });

  it("shows qd-result, foul with the fixed copy and the foul cue", () => {
    expect(present("qd-result", foulView, true, true)).toEqual({
      state: "waiting",
      actionLabel: "Watch the TV",
      statusLine: "Too early, that's a foul",
      hint: "Wait for DRAW next time",
      cue: "foul",
    });
  });

  it("shows qd-result, fooled with its own copy (never the plain foul copy) and the foul cue", () => {
    expect(present("qd-result", fooledView, true, true)).toEqual({
      state: "waiting",
      actionLabel: "Watch the TV",
      statusLine: "That was a fake, that's a foul",
      hint: "Only DRAW counts",
      cue: "foul",
    });
  });

  it("shows qd-result, slow with the fixed copy and no cue", () => {
    expect(present("qd-result", slowView, true, true)).toEqual({
      state: "waiting",
      actionLabel: "Watch the TV",
      statusLine: "Too slow this time",
      hint: "Tap as soon as you see DRAW",
    });
  });

  it("falls back to the watch presentation if qd-result ever arrives without result data", () => {
    const bare: QuickDrawRoundView = { round: 5, target: 3, points: 0 };
    expect(present("qd-result", bare, true, false)).toEqual(present("qd-watch", bare, true, false));
  });

  it("keeps every status line, hint and action label under 40 characters at worst case", () => {
    const worstName = "Twelvecharx1"; // 12 characters, the player name limit.
    const worstRound: QuickDrawRoundView = { round: 9, target: 3, points: 3 };
    const worstResult = (result: QuickDrawResultView["result"]): QuickDrawResultView => ({
      round: 9,
      target: 3,
      points: 3,
      result,
      ms: result === "foul" || result === "fooled" || result === "slow" ? null : 1500,
      winner: result === "slow" ? null : worstName,
    });

    const cases: Array<[QuickDrawScreen, QuickDrawView, boolean, boolean]> = [
      ["qd-watch", worstRound, true, false],
      ["qd-standoff", worstRound, true, false],
      ["qd-standoff", worstRound, true, true],
      ["qd-result", worstResult("won"), true, true],
      ["qd-result", worstResult("lost"), true, true],
      ["qd-result", worstResult("foul"), true, true],
      ["qd-result", worstResult("fooled"), true, true],
      ["qd-result", worstResult("slow"), true, true],
    ];

    for (const [screen, data, synced, tapped] of cases) {
      const view = present(screen, data, synced, tapped);
      expect(view.statusLine.length).toBeLessThan(maxLen);
      expect(view.hint.length).toBeLessThan(maxLen);
      expect(view.actionLabel.length).toBeLessThan(maxLen);
    }
  });
});
