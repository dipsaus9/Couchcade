import { describe, expect, it } from "vitest";
import { present, type LocalState } from "../../src/controller/present.ts";
import type { PuttPhase } from "../../src/controller/putt.ts";
import type { PuttClubScreen, PuttClubView } from "../../src/shared/view.ts";

const view = (patch: Partial<PuttClubView> = {}): PuttClubView => ({
  hole: 4,
  holes: 9,
  par: 2,
  name: "The Elbow",
  turn: 12,
  stroke: 2,
  cap: 6,
  total: 8,
  toPar: 2,
  putter: "Noor",
  first: false,
  last: null,
  ...patch,
});

const local = (patch: Partial<LocalState> = {}): LocalState => ({
  mode: "motion",
  synced: true,
  phase: "aiming",
  ...patch,
});

/** Every string a presentation shows, so length checks (AC 4) don't miss a field. */
function lines(p: ReturnType<typeof present>): string[] {
  return [p.actionLabel, p.statusLine, p.hint];
}

describe("present: docs/games/putt-club.md, Screens", () => {
  it("pc-watch: who's putting and this player's hole/par status", () => {
    const p = present("pc-watch", view({ hole: 4, holes: 9, toPar: 2 }), local());
    expect(p).toMatchObject({
      state: "waiting",
      actionLabel: "Watch the TV",
      statusLine: "Noor is putting",
      hint: "Hole 4 of 9 · you're +2",
    });
    expect(p.pad).toBe(false);
  });

  it("pc-watch: even par shows E", () => {
    const p = present("pc-watch", view({ toPar: 0 }), local());
    expect(p.hint).toBe("Hole 4 of 9 · you're E");
  });

  it("pc-watch: under par shows a minus sign", () => {
    const p = present("pc-watch", view({ toPar: -1 }), local());
    expect(p.hint).toBe("Hole 4 of 9 · you're -1");
  });

  it("pc-next: watch and get ready", () => {
    const p = present("pc-next", view(), local());
    expect(p).toMatchObject({
      state: "waiting",
      actionLabel: "Watch the TV",
      statusLine: "You're up next",
      hint: "Line it up on the TV",
    });
  });

  it("pc-putt, motion, first turn: the safety hint and the your-turn cue", () => {
    const p = present("pc-putt", view({ hole: 1, par: 2, first: true }), local());
    expect(p).toMatchObject({
      state: "hold",
      actionLabel: "Hold to lock the line",
      statusLine: "Hole 1 · par 2 · your turn",
      hint: "Room to swing? Go for it",
      cue: "your-turn",
    });
  });

  it("pc-putt, motion, a later stroke: no cue, points at the TV", () => {
    const p = present("pc-putt", view({ hole: 4, par: 2, stroke: 2, first: false }), local());
    expect(p).toMatchObject({
      state: "hold",
      actionLabel: "Hold to lock the line",
      statusLine: "Hole 4 · par 2 · stroke 2",
      hint: "Point at the TV to aim",
    });
    expect(p.cue).toBeUndefined();
  });

  it("pc-putt, touch: the aim pad shows, and the hint is always the drag hint", () => {
    const p = present("pc-putt", view({ first: true }), local({ mode: "touch" }));
    expect(p.pad).toBe(true);
    expect(p.hint).toBe("Drag the pad to aim");
  });

  it("pc-putt waits for the room clock before the controls turn on", () => {
    const p = present("pc-putt", view(), local({ synced: false }));
    expect(p).toMatchObject({ state: "disabled", actionLabel: "Wait…" });
    expect(p.pad).toBe(false);
  });

  it("pc-putt, locked: Sunny, and the press cue", () => {
    const p = present("pc-putt", view(), local({ phase: "locked" }));
    expect(p).toMatchObject({
      state: "hold",
      actionLabel: "Swing to putt",
      statusLine: "Line locked",
      hint: "Gently does it",
      cue: "press",
    });
    expect(p.pad).toBe(false);
  });

  it("pc-putt, locked, touch: the swipe wording", () => {
    const p = present("pc-putt", view(), local({ mode: "touch", phase: "locked" }));
    expect(p.actionLabel).toBe("Swipe up to putt");
  });

  it("pc-putt, unlocked too early: Sunny again, no cue, aim pad returns in touch", () => {
    const p = present("pc-putt", view(), local({ phase: "unlockedEarly" }));
    expect(p).toMatchObject({
      state: "hold",
      actionLabel: "Hold to lock the line",
      statusLine: "Swing before you let go",
      hint: "Point at the TV to aim",
    });
    expect(p.cue).toBeUndefined();
    expect(p.pad).toBe(false);
  });

  it("pc-putt, unlocked too early, touch: the swipe wording and the pad returns", () => {
    const p = present("pc-putt", view(), local({ mode: "touch", phase: "unlockedEarly" }));
    expect(p.statusLine).toBe("Swipe further up");
    expect(p.hint).toBe("Drag the pad to aim");
    expect(p.pad).toBe(true);
  });

  it("pc-putt, away: disabled until the next turn", () => {
    const p = present("pc-putt", view(), local({ phase: "away" }));
    expect(p).toMatchObject({
      state: "disabled",
      actionLabel: "—",
      statusLine: "Putt away!",
      hint: "Watch the TV",
    });
    expect(p.pad).toBe(false);
  });

  it("pc-result: holed", () => {
    const p = present(
      "pc-result",
      view({
        hole: 4,
        par: 2,
        toPar: 1,
        last: { result: "holed", strokes: 2, hole: 2, auto: false },
      }),
      local(),
    );
    expect(p).toMatchObject({
      state: "waiting",
      actionLabel: "Watch the TV",
      statusLine: "In the hole!",
      hint: "Hole 4: 2 · you're +1",
      cue: "celebrate",
    });
  });

  it("pc-result: a hole-out over par doesn't celebrate", () => {
    const p = present(
      "pc-result",
      view({ par: 2, last: { result: "holed", strokes: 4, hole: 4, auto: false } }),
      local(),
    );
    expect(p.cue).toBeUndefined();
  });

  it("pc-result: penalty", () => {
    const p = present(
      "pc-result",
      view({ last: { result: "penalty", strokes: 3, hole: null, auto: false } }),
      local(),
    );
    expect(p.statusLine).toBe("Penalty · +1");
    expect(p.cue).toBeUndefined();
  });

  it("pc-result: picked up at the cap", () => {
    const p = present(
      "pc-result",
      view({ cap: 6, last: { result: "capped", strokes: 6, hole: 6, auto: false } }),
      local(),
    );
    expect(p.statusLine).toBe("Picked up at 6");
    expect(p.cue).toBeUndefined();
  });

  it("pc-result: rolled, not auto -- putts still allowed before the cap", () => {
    const p = present(
      "pc-result",
      view({ cap: 6, last: { result: "rolled", strokes: 4, hole: null, auto: false } }),
      local(),
    );
    expect(p.statusLine).toBe("2 putts to go");
  });

  it("pc-result: rolled, singular putt to go", () => {
    const p = present(
      "pc-result",
      view({ cap: 6, last: { result: "rolled", strokes: 5, hole: null, auto: false } }),
      local(),
    );
    expect(p.statusLine).toBe("1 putt to go");
  });

  it("pc-result: the turn timer putted for them", () => {
    const p = present(
      "pc-result",
      view({ last: { result: "rolled", strokes: 3, hole: null, auto: true } }),
      local(),
    );
    expect(p.statusLine).toBe("Time's up, we putted for you");
  });

  it("pc-result: mid-hole hint shows the round, not a finished hole score", () => {
    const p = present(
      "pc-result",
      view({
        hole: 4,
        holes: 9,
        toPar: 2,
        last: { result: "rolled", strokes: 3, hole: null, auto: false },
      }),
      local(),
    );
    expect(p.hint).toBe("Hole 4 of 9 · you're +2");
  });

  it("pc-end: the round total against par", () => {
    const p = present("pc-end", view({ toPar: 4 }), local());
    expect(p).toMatchObject({
      state: "waiting",
      actionLabel: "Watch the TV",
      statusLine: "You finished +4",
      hint: "Nice round",
    });
  });

  it("every screen's text stays under 40 characters (AC 4)", () => {
    const screens: PuttClubScreen[] = ["pc-watch", "pc-next", "pc-putt", "pc-result", "pc-end"];
    const modes: LocalState["mode"][] = ["motion", "touch"];
    const phases: PuttPhase[] = ["aiming", "locked", "unlockedEarly", "away"];
    const lasts: PuttClubView["last"][] = [
      null,
      { result: "holed", strokes: 1, hole: 1, auto: false },
      { result: "penalty", strokes: 3, hole: null, auto: false },
      { result: "capped", strokes: 6, hole: 6, auto: false },
      { result: "rolled", strokes: 5, hole: null, auto: false },
      { result: "rolled", strokes: 3, hole: null, auto: true },
    ];
    for (const screen of screens) {
      for (const mode of modes) {
        for (const synced of [true, false]) {
          for (const phase of phases) {
            for (const first of [true, false]) {
              for (const last of lasts) {
                for (const toPar of [-9, 0, 33]) {
                  const p = present(
                    screen,
                    view({ hole: 9, holes: 9, par: 4, stroke: 6, cap: 6, toPar, first, last }),
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
