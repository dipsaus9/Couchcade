import { describe, expect, it } from "vitest";
import { present, type LocalState } from "../../src/controller/present.ts";
import type { RollResult } from "../../src/shared/state.ts";
import type { StrikeNightScreen, StrikeNightView } from "../../src/shared/view.ts";

const view = (patch: Partial<StrikeNightView> = {}): StrikeNightView => ({
  frame: 2,
  frames: 10,
  turn: 5,
  roll: 1,
  x: 0,
  total: 34,
  bowler: "Noor",
  standing: 10,
  first: false,
  last: null,
  ...patch,
});

const local = (patch: Partial<LocalState> = {}): LocalState => ({
  mode: "motion",
  synced: true,
  phase: "ready",
  ...patch,
});

/** Every string a presentation shows, so length checks (AC 4) don't miss a field. */
function lines(p: ReturnType<typeof present>): string[] {
  return [p.actionLabel, p.statusLine, p.hint];
}

const roll = (patch: Partial<RollResult> = {}): RollResult => ({
  pins: 7,
  mark: "open",
  auto: false,
  frame: null,
  ...patch,
});

describe("present: docs/games/strike-night.md, Screens", () => {
  it("sn-watch shows who's bowling and this player's frame and total", () => {
    const p = present("sn-watch", view(), local());
    expect(p).toMatchObject({
      state: "waiting",
      actionLabel: "Watch the TV",
      statusLine: "Noor is bowling",
      hint: "Frame 2 of 10 · you have 34",
      bar: false,
      canGrip: false,
    });
    expect(p.cue).toBeUndefined();
  });

  it("sn-next tells the next bowler to get ready", () => {
    const p = present("sn-next", view(), local());
    expect(p).toMatchObject({
      state: "waiting",
      actionLabel: "Watch the TV",
      statusLine: "You're up next",
      hint: "Get ready to bowl",
    });
  });

  it("sn-bowl roll 1, ready, fires the your-turn cue", () => {
    const p = present("sn-bowl", view({ roll: 1 }), local());
    expect(p).toMatchObject({
      state: "hold",
      actionLabel: "Hold the ball",
      statusLine: "Frame 2 of 10 · your turn",
      hint: "Drag the bar to move",
      bar: true,
      canGrip: true,
      cue: "your-turn",
    });
  });

  it("sn-bowl roll 1, this player's first turn of the match, hints at room to swing", () => {
    const p = present("sn-bowl", view({ roll: 1, first: true }), local());
    expect(p.hint).toBe("Room to swing? Go for it");
  });

  it("sn-bowl roll 2 shows the standing pins and never repeats the room hint", () => {
    const p = present("sn-bowl", view({ roll: 2, standing: 3, first: true }), local());
    expect(p.statusLine).toBe("3 pins left");
    expect(p.cue).toBeUndefined();
  });

  it("sn-bowl, one pin left, uses the singular", () => {
    const p = present("sn-bowl", view({ roll: 2, standing: 1 }), local());
    expect(p.statusLine).toBe("1 pin left");
  });

  it("sn-bowl waits for the room clock before the grip turns on", () => {
    const p = present("sn-bowl", view(), local({ synced: false }));
    expect(p).toMatchObject({
      state: "disabled",
      actionLabel: "Wait…",
      canGrip: false,
      bar: false,
    });
  });

  it("gripping (local), motion: Swing, then let go", () => {
    const p = present("sn-bowl", view(), local({ phase: "gripping" }));
    expect(p).toMatchObject({
      state: "hold",
      actionLabel: "Swing, then let go",
      statusLine: "Swing your arm",
      hint: "Twist to hook",
      bar: false,
      canGrip: false,
    });
    expect(p.cue).toBeUndefined();
  });

  it("gripping (local), touch: Swipe up", () => {
    const p = present("sn-bowl", view(), local({ mode: "touch", phase: "gripping" }));
    expect(p.actionLabel).toBe("Swipe up");
  });

  it("no swing (local), motion: Swing before you let go", () => {
    const p = present("sn-bowl", view(), local({ phase: "noSwing" }));
    expect(p).toMatchObject({
      state: "hold",
      actionLabel: "Hold the ball",
      statusLine: "Swing before you let go",
      hint: "Drag the bar to move",
      bar: true,
      canGrip: true,
    });
  });

  it("no swing (local), touch: Swipe further up", () => {
    const p = present("sn-bowl", view(), local({ mode: "touch", phase: "noSwing" }));
    expect(p).toMatchObject({
      actionLabel: "Swipe up to bowl",
      statusLine: "Swipe further up",
    });
  });

  it("ball away (local): disabled until the next sn-bowl", () => {
    const p = present("sn-bowl", view(), local({ phase: "away" }));
    expect(p).toMatchObject({
      state: "disabled",
      actionLabel: "—",
      statusLine: "Ball away!",
      hint: "Watch the TV",
      bar: false,
      canGrip: false,
    });
    expect(p.cue).toBeUndefined();
  });

  it("sn-result: a strike celebrates and shows the frame score once the frame ends", () => {
    const p = present(
      "sn-result",
      view({ last: roll({ mark: "strike", pins: 10, frame: 30 }) }),
      local(),
    );
    expect(p).toMatchObject({
      state: "waiting",
      statusLine: "Strike!",
      hint: "Frame 30 · total 34",
      cue: "celebrate",
    });
  });

  it("sn-result: a spare", () => {
    const p = present("sn-result", view({ last: roll({ mark: "spare", frame: 10 }) }), local());
    expect(p.statusLine).toBe("Spare!");
    expect(p.cue).toBeUndefined();
  });

  it("sn-result: an open frame shows the pins", () => {
    const p = present("sn-result", view({ last: roll({ mark: "open", pins: 9 }) }), local());
    expect(p.statusLine).toBe("9 pins");
  });

  it("sn-result: a gutter ball", () => {
    const p = present("sn-result", view({ last: roll({ mark: "gutter", pins: 0 }) }), local());
    expect(p.statusLine).toBe("Gutter ball");
  });

  it("sn-result: roll 1 without a frame score says to roll again", () => {
    const p = present("sn-result", view({ last: roll({ frame: null }) }), local());
    expect(p.hint).toBe("Roll again soon");
  });

  it("sn-result: the turn timer rolled it", () => {
    const p = present("sn-result", view({ last: roll({ auto: true, mark: "open" }) }), local());
    expect(p.statusLine).toBe("Time's up, we rolled for you");
  });

  it("every screen's text stays under 40 characters (AC 4)", () => {
    const screens: StrikeNightScreen[] = ["sn-watch", "sn-next", "sn-bowl", "sn-result"];
    const phases: LocalState["phase"][] = ["ready", "gripping", "noSwing", "away"];
    const modes: LocalState["mode"][] = ["motion", "touch"];
    const lasts: (RollResult | null)[] = [
      null,
      roll({ mark: "strike", pins: 10, frame: 30 }),
      roll({ mark: "spare", frame: 10 }),
      roll({ mark: "open", pins: 9 }),
      roll({ mark: "gutter", pins: 0 }),
      roll({ auto: true }),
    ];
    for (const screen of screens) {
      for (const mode of modes) {
        for (const phase of phases) {
          for (const synced of [true, false]) {
            for (const first of [true, false]) {
              for (const last of lasts) {
                for (const rollNumber of [1, 2] as const) {
                  const p = present(
                    screen,
                    view({ roll: rollNumber, first, last, standing: 3, bowler: "Twelve chars" }),
                    local({ mode, synced, phase }),
                  );
                  for (const line of lines(p)) expect(line.length).toBeLessThan(40);
                }
              }
            }
          }
        }
      }
    }
  });
});
