import { describe, expect, it } from "vitest";
import { init, slotSpec } from "../../src/shared/state.ts";
import type { BandejaState } from "../../src/shared/state.ts";
import { cpuDifficulty, cpuShot, gradeForReaction } from "../../src/shared/ai/cpu.ts";
import { players2, players4 } from "../helpers.ts";

describe("gradeForReaction", () => {
  it("grades the same clean/ok/mishit/whiff bands a human swing's timing error uses", () => {
    expect(gradeForReaction(0)).toBe("clean");
    expect(gradeForReaction(60)).toBe("clean");
    expect(gradeForReaction(61)).toBe("ok");
    expect(gradeForReaction(140)).toBe("ok");
    expect(gradeForReaction(141)).toBe("mishit");
    expect(gradeForReaction(240)).toBe("mishit");
    expect(gradeForReaction(241)).toBe("whiff");
    expect(gradeForReaction(-90)).toBe("ok"); // sign doesn't matter, only the size of the error
  });

  it("the shipped difficulty grades as ok - a real return, not a gift", () => {
    expect(gradeForReaction(cpuDifficulty.reactionMs)).toBe("ok");
  });
});

describe("cpuShot", () => {
  it("aims centre when the receiving side's coverage is even (doubles, both real)", () => {
    const [alice, bob, carol, dave] = players4();
    const state = init([alice, bob, carol, dave], 1); // a-left, b-left, a-right, b-right
    const shot = cpuShot(state, slotSpec("b-right"));
    expect(shot.angleDeg).toBe(0);
    expect(shot.grade).toBe("ok");
  });

  it("aims at the away half of a doubles side (rule 10, CC-23.8: the stand-in had no aim at all)", () => {
    const [alice, bob, carol, dave] = players4();
    const base = init([alice, bob, carol, dave], 1);
    // a-left (alice, home x = 2.6, the TV's left) has stopped responding; a-right (carol, home
    // x = 7.4) is still fully engaged. Side A's own real coverage is now entirely on the right.
    const state: BandejaState = {
      ...base,
      players: base.players.map((player) =>
        player.id === alice.id ? { ...player, missStreak: 3 } : player,
      ),
    };
    // b-right returning toward side A should aim left, into the gap alice left.
    const shot = cpuShot(state, slotSpec("b-right"));
    expect(shot.angleDeg).toBeLessThan(0);
  });

  it("aims at the opposite half when the departed player is on the right instead", () => {
    const [alice, bob, carol, dave] = players4();
    const base = init([alice, bob, carol, dave], 1);
    const state: BandejaState = {
      ...base,
      players: base.players.map(
        (player) => (player.id === carol.id ? { ...player, left: true } : player), // a-right (7.4) leaves
      ),
    };
    const shot = cpuShot(state, slotSpec("b-right"));
    expect(shot.angleDeg).toBeGreaterThan(0);
  });

  it("never exceeds a human swing's own max aim angle (aimAngleGain)", () => {
    const [alice, bob, carol, dave] = players4();
    const base = init([alice, bob, carol, dave], 1);
    const state: BandejaState = {
      ...base,
      players: base.players.map((player) =>
        player.id === alice.id ? { ...player, missStreak: 3 } : player,
      ),
    };
    const shot = cpuShot(state, slotSpec("b-right"));
    expect(Math.abs(shot.angleDeg)).toBeLessThanOrEqual(22); // aimAngleGain
  });

  it("aims centre in singles - a dead-centre home spot has no lateral side to prefer", () => {
    const [alice, bob] = players2();
    const base = init([alice, bob], 1);
    const state: BandejaState = {
      ...base,
      players: base.players.map((player) =>
        player.id === alice.id ? { ...player, missStreak: 3 } : player,
      ),
    };
    const shot = cpuShot(state, slotSpec("a-solo"));
    expect(shot.angleDeg).toBe(0);
  });
});
