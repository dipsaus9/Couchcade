import { describe, expect, it } from "vitest";
import { present, type DrawPhase, type LocalState } from "../../src/controller/present.ts";
import type { TargetRangeView } from "../../src/shared/view.ts";

const local = (patch: Partial<LocalState> = {}): LocalState => ({
  mode: "motion",
  synced: true,
  draw: "ready",
  power: 0,
  afterVolley: false,
  ...patch,
});

const view = (patch: Partial<TargetRangeView> = {}): TargetRangeView => ({
  round: 1,
  arrow: 1,
  volley: 1,
  points: 0,
  last: null,
  ...patch,
});

const lines = (p: ReturnType<typeof present>) => [p.actionLabel, p.statusLine, p.hint];

describe("tr-watch", () => {
  it("round 1's intro: watch the TV, hold on tight", () => {
    expect(present("tr-watch", view(), local())).toEqual({
      state: "waiting",
      actionLabel: "Watch the TV",
      statusLine: "Round 1 of 4 · near",
      hint: "Hold on tight, point at the TV",
      fill: 0,
      pad: false,
      canDraw: false,
    });
  });

  it("round 1's intro in touch mode points at the pad instead", () => {
    expect(present("tr-watch", view(), local({ mode: "touch" })).hint).toBe("Drag the pad to aim");
  });

  it("later intros name the round and say to aim a little high", () => {
    const p = present("tr-watch", view({ round: 3, volley: 7, last: 4, points: 20 }), local());
    expect(p).toMatchObject({
      state: "waiting",
      statusLine: "Round 3 of 4 · far",
      hint: "Aim a little high",
    });
    expect(present("tr-watch", view({ round: 4, volley: 10 }), local()).statusLine).toBe(
      "Round 4 of 4 · far and gusty",
    );
  });

  it.each([
    [10, "Bullseye!", "celebrate"],
    [7, "You scored 7", undefined],
    [0, "Missed this time", undefined],
    ["late", "Too late for that one", undefined],
    ["none", "No arrow this time", undefined],
  ] as const)("after a volley with %s: %s", (last, statusLine, cue) => {
    const p = present(
      "tr-watch",
      view({ arrow: 2, volley: 2, last, points: 12 }),
      local({ afterVolley: true }),
    );
    expect(p).toMatchObject({
      state: "waiting",
      actionLabel: "Watch the TV",
      statusLine,
      hint: "12 points so far",
    });
    expect(p.cue).toBe(cue);
    expect(p.canDraw).toBe(false);
  });

  it("counts a single point without a plural", () => {
    expect(
      present("tr-watch", view({ last: 1, points: 1 }), local({ afterVolley: true })).hint,
    ).toBe("1 point so far");
  });
});

describe("tr-shoot", () => {
  it("ready on the first volley: pull down to draw, point at the TV, your turn", () => {
    expect(present("tr-shoot", view(), local())).toEqual({
      state: "hold",
      actionLabel: "Pull down to draw",
      statusLine: "Arrow 1 of 3",
      hint: "Point at the TV",
      fill: 0,
      pad: false,
      canDraw: true,
      cue: "your-turn",
    });
  });

  it.each([
    [9, "Last arrow: 9"],
    [0, "Last arrow missed"],
    ["late", "Last arrow was too late"],
    ["none", "Point at the TV"],
  ] as const)("later arrows hint at the last one (%s)", (last, hint) => {
    const p = present("tr-shoot", view({ arrow: 2, volley: 5, round: 2, last }), local());
    expect(p).toMatchObject({ statusLine: "Arrow 2 of 3", hint, canDraw: true });
    expect(p.cue).toBeUndefined();
  });

  it("the first arrow of a later round points at the TV, not at last round's arrow", () => {
    expect(
      present("tr-shoot", view({ round: 2, arrow: 1, volley: 4, last: 8 }), local()).hint,
    ).toBe("Point at the TV");
  });

  it("touch mode shows the pad and says to drag it", () => {
    expect(
      present("tr-shoot", view({ arrow: 2, volley: 2, last: 9 }), local({ mode: "touch" })),
    ).toMatchObject({
      state: "hold",
      actionLabel: "Pull down to draw",
      hint: "Drag the pad to aim",
      pad: true,
      canDraw: true,
    });
  });

  it("drawing fills with power and says Full draw! at 1", () => {
    expect(present("tr-shoot", view(), local({ draw: "drawing", power: 0.4 }))).toEqual({
      state: "hold",
      actionLabel: "Draw…",
      statusLine: "Let go to shoot",
      hint: "Hold steady",
      fill: 0.4,
      pad: false,
      canDraw: false,
    });
    expect(present("tr-shoot", view(), local({ draw: "drawing", power: 1 }))).toMatchObject({
      actionLabel: "Full draw!",
      fill: 1,
    });
    expect(
      present("tr-shoot", view(), local({ mode: "touch", draw: "drawing", power: 1 })).pad,
    ).toBe(true);
  });

  it("too weak: pull further to shoot, and draw again", () => {
    expect(present("tr-shoot", view(), local({ draw: "weak" }))).toEqual({
      state: "hold",
      actionLabel: "Pull down to draw",
      statusLine: "Pull further to shoot",
      hint: "Point at the TV",
      fill: 0,
      pad: false,
      canDraw: true,
    });
    expect(present("tr-shoot", view(), local({ mode: "touch", draw: "weak" }))).toMatchObject({
      hint: "Drag the pad to aim",
      pad: true,
    });
  });

  it("shot: the button is off until the next volley", () => {
    expect(present("tr-shoot", view(), local({ draw: "shot" }))).toEqual({
      state: "disabled",
      actionLabel: "—",
      statusLine: "Arrow away!",
      hint: "Watch the TV",
      fill: 0,
      pad: false,
      canDraw: false,
    });
    expect(present("tr-shoot", view(), local({ mode: "touch", draw: "shot" })).pad).toBe(false);
  });

  it("keeps the draw button off until the room clock has synced", () => {
    expect(present("tr-shoot", view(), local({ synced: false }))).toMatchObject({
      state: "disabled",
      canDraw: false,
      pad: false,
    });
  });
});

describe("text", () => {
  it("keeps every line under 40 characters in every state", () => {
    const lasts: TargetRangeView["last"][] = [null, 0, 1, 9, 10, "late", "none"];
    const draws: DrawPhase[] = ["ready", "drawing", "weak", "shot"];
    for (const screen of ["tr-watch", "tr-shoot"] as const)
      for (let round = 1; round <= 4; round++)
        for (let arrow = 1; arrow <= 3; arrow++)
          for (const last of lasts)
            for (const draw of draws)
              for (const mode of ["motion", "touch"] as const)
                for (const flag of [true, false]) {
                  const data = view({
                    round,
                    arrow,
                    volley: (round - 1) * 3 + arrow,
                    points: 120,
                    last,
                  });
                  const p = present(
                    screen,
                    data,
                    local({ mode, draw, power: 1, synced: flag, afterVolley: flag }),
                  );
                  for (const line of lines(p)) {
                    expect(line.length).toBeGreaterThan(0);
                    expect(line.length).toBeLessThan(40);
                  }
                }
  });
});
