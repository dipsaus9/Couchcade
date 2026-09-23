import { describe, expect, it } from "vitest";
import { present, type LocalState } from "../../src/controller/present.ts";
import type { BandejaScreen, BandejaView } from "../../src/shared/view.ts";

const view = (patch: Partial<BandejaView> = {}): BandejaView => ({
  side: "a",
  slot: "left",
  scores: [3, 2],
  target: 7,
  point: 6,
  partner: "Ren",
  opponents: ["Noor", "Sam"],
  serving: false,
  last: null,
  ...patch,
});

const local = (patch: Partial<LocalState> = {}): LocalState => ({
  mode: "motion",
  synced: true,
  justEnded: false,
  ...patch,
});

/** Every string a presentation shows, so length checks (AC 4) don't miss a field. */
function lines(p: ReturnType<typeof present>): string[] {
  return [p.actionLabel, p.statusLine, p.hint];
}

describe("present: docs/games/bandeja.md, Screens", () => {
  it("bj-play, motion, first point: the safety hint and the your-turn cue", () => {
    const p = present("bj-play", view({ last: null }), local());
    expect(p).toMatchObject({
      state: "disabled",
      actionLabel: "Swing your arm",
      statusLine: "Bandeja · first to 7",
      hint: "Room to swing? Go for it",
      cue: "your-turn",
    });
  });

  it("bj-play, motion, steady: score and serve", () => {
    const p = present(
      "bj-play",
      view({ last: { won: true, reason: "net" }, serving: true, scores: [3, 2] }),
      local({ justEnded: false }),
    );
    expect(p).toMatchObject({
      state: "disabled",
      actionLabel: "Swing your arm",
      statusLine: "3 – 2 · your serve",
      hint: "Watch the ring on the TV",
    });
    expect(p.cue).toBeUndefined();
  });

  it("bj-play, motion, steady, not serving: score only", () => {
    const p = present(
      "bj-play",
      view({ last: { won: false, reason: "net" }, serving: false }),
      local({ justEnded: false }),
    );
    expect(p.statusLine).toBe("3 – 2");
  });

  it("bj-play, touch: the pad, and the constant touch hint", () => {
    const p = present("bj-play", view({ last: null }), local({ mode: "touch" }));
    expect(p).toMatchObject({
      state: "hold",
      actionLabel: "Tap left or right",
      hint: "Tap as the ring closes",
    });
  });

  it("bj-play, touch, steady: the touch hint never becomes the motion safety hint", () => {
    const p = present(
      "bj-play",
      view({ last: { won: true, reason: "net" } }),
      local({ mode: "touch", justEnded: false }),
    );
    expect(p.hint).toBe("Tap as the ring closes");
  });

  it("bj-play after a point won: Point! and the celebrate cue", () => {
    const p = present(
      "bj-play",
      view({ scores: [4, 2], last: { won: true, reason: "double-bounce" } }),
      local({ justEnded: true }),
    );
    expect(p).toMatchObject({ statusLine: "Point! 4 – 2", cue: "celebrate" });
  });

  it("bj-play after a point lost to the net: Net ·", () => {
    const p = present(
      "bj-play",
      view({ scores: [3, 3], last: { won: false, reason: "net" } }),
      local({ justEnded: true }),
    );
    expect(p).toMatchObject({ statusLine: "Net · 3 – 3" });
    expect(p.cue).toBeUndefined();
  });

  it("bj-play after a point lost to a double bounce or the squeeze: Their point ·", () => {
    for (const reason of ["double-bounce", "squeeze"] as const) {
      const p = present(
        "bj-play",
        view({ scores: [3, 3], last: { won: false, reason } }),
        local({ justEnded: true }),
      );
      expect(p.statusLine).toBe("Their point · 3 – 3");
    }
  });

  it("bj-play settles from the point outcome to the steady score line once justEnded clears", () => {
    const data = view({ scores: [4, 2], last: { won: true, reason: "net" }, serving: true });
    const fresh = present("bj-play", data, local({ justEnded: true }));
    const settled = present("bj-play", data, local({ justEnded: false }));
    expect(fresh.statusLine).toBe("Point! 4 – 2");
    expect(settled.statusLine).toBe("4 – 2 · your serve");
  });

  it("bj-play waits for the room clock before the controls turn on", () => {
    const p = present("bj-play", view(), local({ synced: false }));
    expect(p).toMatchObject({ state: "disabled", actionLabel: "Wait…" });
  });

  it("bj-end: you won, winner's score first, celebrate", () => {
    const p = present("bj-end", view({ side: "a", scores: [7, 4] }), local());
    expect(p).toMatchObject({
      state: "waiting",
      actionLabel: "Watch the TV",
      statusLine: "You won 7 – 4",
      hint: "Nice rallies",
      cue: "celebrate",
    });
  });

  it("bj-end: they won, winner's score first, no cue", () => {
    const p = present("bj-end", view({ side: "a", scores: [4, 7] }), local());
    expect(p).toMatchObject({ statusLine: "They won 7 – 4" });
    expect(p.cue).toBeUndefined();
  });

  it("bj-end reads scores from the player's own side", () => {
    const p = present("bj-end", view({ side: "b", scores: [4, 7] }), local());
    expect(p.statusLine).toBe("You won 7 – 4");
  });

  it("every screen's text stays under 40 characters (AC 4)", () => {
    const screens: BandejaScreen[] = ["bj-play", "bj-end"];
    const modes: LocalState["mode"][] = ["motion", "touch"];
    const lasts: BandejaView["last"][] = [
      null,
      { won: true, reason: "net" },
      { won: false, reason: "net" },
      { won: false, reason: "double-bounce" },
      { won: false, reason: "squeeze" },
    ];
    for (const screen of screens) {
      for (const mode of modes) {
        for (const synced of [true, false]) {
          for (const justEnded of [true, false]) {
            for (const last of lasts) {
              for (const serving of [true, false]) {
                for (const side of ["a", "b"] as const) {
                  const p = present(
                    screen,
                    view({ last, serving, side, scores: [13, 12] }),
                    local({ mode, synced, justEnded }),
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
