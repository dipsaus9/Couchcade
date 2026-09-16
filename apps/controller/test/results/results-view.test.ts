import { describe, expect, it } from "vitest";
import {
  parseResultsView,
  placeLabel,
  resultsActions,
} from "../../src/screens/results/results-view.ts";

describe("parseResultsView", () => {
  it("reads an in-game player's placement", () => {
    expect(
      parseResultsView({ title: "Quick Draw", vipName: "Sam", place: 2, of: 3, score: 4 }),
    ).toEqual({
      title: "Quick Draw",
      vipName: "Sam",
      place: 2,
      of: 3,
      score: 4,
      vip: undefined,
    });
  });

  it("reads the VIP's actions alongside their own placement", () => {
    expect(
      parseResultsView({
        title: "Quick Draw",
        vipName: "Sam",
        place: 1,
        of: 3,
        vip: { canPlayAgain: true, hint: null },
      }),
    ).toEqual({
      title: "Quick Draw",
      vipName: "Sam",
      place: 1,
      of: 3,
      score: undefined,
      vip: { canPlayAgain: true, hint: null },
    });
  });

  it("reads a disabled Play again hint", () => {
    const view = parseResultsView({
      title: "Quick Draw",
      vipName: "Sam",
      vip: { canPlayAgain: false, hint: "Quick Draw needs 2 to 8 players" },
    });
    expect(view?.vip).toEqual({ canPlayAgain: false, hint: "Quick Draw needs 2 to 8 players" });
    expect(view?.place).toBeUndefined();
  });

  it("rejects anything without a title", () => {
    expect(parseResultsView(null)).toBeNull();
    expect(parseResultsView({})).toBeNull();
    expect(parseResultsView({ title: 4 })).toBeNull();
  });
});

describe("placeLabel", () => {
  it("labels ordinals, including the 11 to 13 exception", () => {
    expect([1, 2, 3, 4, 5, 11, 12, 13, 21, 22, 23, 101].map(placeLabel)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "5th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "101st",
    ]);
  });
});

describe("resultsActions", () => {
  it("sends the session-flow ui:actions", () => {
    expect(resultsActions.playAgain()).toEqual({ t: "ui:action", d: { action: "play-again" } });
    expect(resultsActions.backToMenu()).toEqual({ t: "ui:action", d: { action: "back-to-menu" } });
  });
});
