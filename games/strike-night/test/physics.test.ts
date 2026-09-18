import { describe, expect, it } from "vitest";
import { bowlAndSettle, room } from "./helpers.ts";

/**
 * The prototype and tuning targets from docs/games/strike-night.md, "Ball and pins": the numbers
 * as ranges, run for real through `@couchcade/physics` and this story's rules (no hardcoded
 * outcomes). CC-12.2 owns this tuning.
 */
describe("prototype and tuning targets", () => {
  it("a pocket hit at speed 0.8 strikes", () => {
    const state = bowlAndSettle(room(1), { x: 0.2, speed: 0.8, angle: 0, spin: 0 });
    const player = state.players[0]!;
    expect(player.last?.mark).toBe("strike");
    expect(player.frames[0]!.roll1).toBe(10);
  });

  it("a head-on hit leaves pins standing", () => {
    const state = bowlAndSettle(room(1), { x: 0, speed: 0.8, angle: 0, spin: 0 });
    const player = state.players[0]!;
    expect(player.last?.mark).not.toBe("strike");
    expect(player.frames[0]!.roll1).toBeGreaterThan(0);
    expect(player.frames[0]!.roll1).toBeLessThan(10);
    expect(state.standingPins.length).toBeGreaterThan(0);
  });

  it("a ball from x = ±1 with no spin and angle 0 stays on the lane", () => {
    for (const x of [-1, 1]) {
      const state = bowlAndSettle(room(1), { x, speed: 0.8, angle: 0, spin: 0 });
      expect(state.players[0]!.last?.mark).not.toBe("gutter");
    }
  });

  it("a ball with angle 30 from the centre doesn't reach the gutter before the pins", () => {
    const state = bowlAndSettle(room(1), { x: 0, speed: 0.8, angle: 30, spin: 0 });
    expect(state.players[0]!.last?.mark).not.toBe("gutter");
  });

  it("no ball tunnels through a pin at 9 m/s (speed 1, straight at the head pin)", () => {
    const state = bowlAndSettle(room(1), { x: 0, speed: 1, angle: 0, spin: 0 });
    const player = state.players[0]!;
    // A tunnelling ball would pass every pin untouched: 0 knocked down. A registered hit knocks
    // down at least the head pin it was aimed at.
    expect(player.frames[0]!.roll1).toBeGreaterThan(0);
  });

  it("a strong hook drifts the ball into the gutter before the pins", () => {
    const state = bowlAndSettle(room(1), { x: 1, speed: 0.3, angle: 0, spin: 1 });
    const player = state.players[0]!;
    expect(player.last?.mark).toBe("gutter");
    expect(player.frames[0]!.roll1).toBe(0);
  });
});
