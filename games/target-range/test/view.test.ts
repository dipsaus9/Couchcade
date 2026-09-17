import { describe, expect, it } from "vitest";
import { createPlayers } from "@couchcade/game-sdk/testing";
import { controllerViewSchema } from "@couchcade/protocol";
import { init, view } from "../src/shared/index.ts";
import type { TargetRangeState } from "../src/shared/index.ts";
import { playMatch, stepThrough } from "./helpers.ts";

const [alice, bob] = createPlayers(2) as [
  ReturnType<typeof createPlayers>[number],
  ReturnType<typeof createPlayers>[number],
];

describe("view", () => {
  it("watches the TV in the intro, before any result", () => {
    expect(view(init([alice, bob], 1), alice)).toEqual({
      screen: "tr-watch",
      data: { round: 1, arrow: 1, volley: 1, points: 0, last: null },
    });
  });

  it("shoots during open and landing, with the your-turn cue on the first volley only", () => {
    const base = init([alice, bob], 1);
    const open: TargetRangeState = { ...base, phase: "open", openAtMs: 2500 };
    expect(view(open, alice)).toEqual({
      screen: "tr-shoot",
      data: { round: 1, arrow: 1, volley: 1, points: 0, last: null },
      cue: "your-turn",
    });
    expect(view({ ...open, phase: "landing" }, alice).screen).toBe("tr-shoot");
    const later = { ...open, round: 2, arrow: 3 };
    expect(view(later, alice)).toEqual({
      screen: "tr-shoot",
      data: { round: 2, arrow: 3, volley: 6, points: 0, last: null },
    });
  });

  it("shows the result at the reveal, celebrating a bullseye", () => {
    const base = init([alice, bob], 1);
    const reveal: TargetRangeState = {
      ...base,
      phase: "reveal",
      arrow: 2,
      players: base.players.map((player, i) => ({
        ...player,
        points: 17,
        last: i === 0 ? 10 : "late",
      })),
    };
    expect(view(reveal, alice)).toEqual({
      screen: "tr-watch",
      data: { round: 1, arrow: 2, volley: 2, points: 17, last: 10 },
      cue: "celebrate",
    });
    expect(view(reveal, bob)).toEqual({
      screen: "tr-watch",
      data: { round: 1, arrow: 2, volley: 2, points: 17, last: "late" },
    });
  });

  it("changes 2 times per volley and once per round, 27 view changes a match", () => {
    const target = playMatch(4, 2, (volley, slot) =>
      slot === 1 && volley === 5 ? null : { afterMs: 2000, dx: slot * 4, dy: 0 },
    );
    let last = JSON.stringify(view(init(target.players, 4), alice));
    let changes = 0;
    stepThrough(target.recording(), (step) => {
      const current = view(step.state, alice);
      expect(controllerViewSchema.safeParse(current).success).toBe(true);
      const json = JSON.stringify(current);
      // Well under the 1 KB frame, with room for the envelope.
      expect(json.length).toBeLessThan(200);
      if (json !== last) changes += 1;
      last = json;
    });
    // 12 opens, 12 reveals and 3 round starts after the first.
    expect(changes).toBe(27);
  });
});
