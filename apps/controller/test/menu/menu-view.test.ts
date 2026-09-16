import { describe, expect, it } from "vitest";
import {
  choosingName,
  isVipLobby,
  menuActions,
  parseMenuView,
  secondsLeft,
} from "../../src/screens/menu/menu-view.ts";

describe("parseMenuView", () => {
  it("reads the games with their grey and motion flags, in the host's order", () => {
    expect(
      parseMenuView({
        games: [
          ["quick-draw", "Quick Draw", 1],
          ["strike-night", "Strike Night", 2],
          ["target-range", "Target Range", 3],
        ],
        picked: "quick-draw",
        startsAt: 1_789_000_003_000,
      }),
    ).toEqual({
      games: [
        { id: "quick-draw", title: "Quick Draw", fits: true, needsMotion: false },
        { id: "strike-night", title: "Strike Night", fits: false, needsMotion: true },
        { id: "target-range", title: "Target Range", fits: true, needsMotion: true },
      ],
      picked: "quick-draw",
      startsAt: 1_789_000_003_000,
    });
  });

  it("has no countdown without a pick", () => {
    expect(parseMenuView({ games: [], picked: null, startsAt: 5 })).toEqual({
      games: [],
      picked: null,
      startsAt: null,
    });
  });

  it("rejects anything that isn't a menu view", () => {
    expect(parseMenuView(null)).toBeNull();
    expect(parseMenuView({ games: {} })).toBeNull();
    expect(parseMenuView({ games: [["quick-draw", "Quick Draw"]] })).toBeNull();
    expect(parseMenuView({ games: [[1, "Quick Draw", 1]] })).toBeNull();
  });
});

describe("lobby and waiting views", () => {
  it("makes a phone the VIP only when the host's lobby view says so", () => {
    expect(isVipLobby({ screen: "lobby", data: { vip: true } })).toBe(true);
    expect(isVipLobby({ screen: "lobby", data: { vip: false } })).toBe(false);
    expect(isVipLobby({ screen: "lobby", data: null })).toBe(false);
    expect(isVipLobby({ screen: "menu", data: { vip: true } })).toBe(false);
    expect(isVipLobby(null)).toBe(false);
  });

  it("reads the VIP's name from vip-choosing", () => {
    expect(choosingName({ screen: "vip-choosing", data: { name: "Sam" } })).toBe("Sam");
    expect(choosingName({ screen: "vip-choosing", data: { name: null } })).toBeNull();
    expect(choosingName({ screen: "waiting", data: { name: "Sam" } })).toBeNull();
  });
});

describe("countdown and actions", () => {
  it("counts whole seconds down to 1", () => {
    expect(
      [3000, 2999, 2000, 1999, 1, 0, -100].map((ms) => secondsLeft(10_000 + ms, 10_000)),
    ).toEqual([3, 3, 2, 2, 1, 1, 1]);
  });

  it("sends the session-flow ui:actions", () => {
    expect(menuActions.chooseGame()).toEqual({ t: "ui:action", d: { action: "start" } });
    expect(menuActions.surpriseMe()).toEqual({ t: "ui:action", d: { action: "pick-game" } });
    expect(menuActions.pick("quick-draw")).toEqual({
      t: "ui:action",
      d: { action: "pick-game", value: "quick-draw" },
    });
    expect(menuActions.cancel()).toEqual({ t: "ui:action", d: { action: "back-to-menu" } });
  });
});
