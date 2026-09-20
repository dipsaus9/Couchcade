import { audio } from "@couchcade/audio";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuickDrawCue } from "../../src/host/cues.ts";
import { playCueSound, popStaggerMs, quickDrawSounds } from "../../src/host/sounds.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("quickDrawSounds", () => {
  it("has a src, bus and visual for every sound, owned by quick-draw", () => {
    for (const ref of Object.values(quickDrawSounds.refs)) {
      expect(ref.owner).toBe("quick-draw");
      expect(ref.def.src.length).toBeGreaterThan(0);
      expect(["effects", "music"]).toContain(ref.def.bus);
      expect(ref.def.visual.length).toBeGreaterThan(0);
    }
  });
});

describe("playCueSound", () => {
  it("does nothing on round (the game music loop isn't wired yet)", () => {
    const play = vi.spyOn(audio, "play").mockReturnValue({ stop: () => {} });
    const music = vi.spyOn(audio, "music").mockImplementation(() => {});
    playCueSound({ type: "round", round: 1 });
    expect(play).not.toHaveBeenCalled();
    expect(music).not.toHaveBeenCalled();
  });

  it("fades the music out and starts the wind loop on standoff", () => {
    const music = vi.spyOn(audio, "music").mockImplementation(() => {});
    const play = vi.spyOn(audio, "play").mockReturnValue({ stop: () => {} });
    playCueSound({ type: "standoff", round: 1 });
    expect(music).toHaveBeenCalledOnce();
    expect(music).toHaveBeenCalledWith(null, { fadeMs: 150 });
    expect(play).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledWith(quickDrawSounds.refs.wind);
  });

  it.each([
    ["word", "fakeSting"],
    ["crow", "crowCaw"],
    ["glint", "glintTing"],
  ] as const)("plays %s's sound on a %s fake", (kind, refId) => {
    const play = vi.spyOn(audio, "play").mockReturnValue({ stop: () => {} });
    const cue: QuickDrawCue = { type: "fake", kind, word: null, playerId: null };
    playCueSound(cue);
    expect(play).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledWith(quickDrawSounds.refs[refId]);
  });

  it("stops the wind loop and plays the DRAW sting on draw", () => {
    const stop = vi.fn<() => void>();
    vi.spyOn(audio, "play")
      .mockReturnValueOnce({ stop })
      .mockReturnValue({ stop: () => {} });
    const play = vi.spyOn(audio, "play");
    playCueSound({ type: "standoff", round: 1 }); // starts the wind loop
    playCueSound({ type: "draw", round: 1 });
    expect(stop).toHaveBeenCalledOnce();
    expect(play).toHaveBeenLastCalledWith(quickDrawSounds.refs.drawSting);
  });

  it("plays the foul token on foul", () => {
    const play = vi.spyOn(audio, "play").mockReturnValue({ stop: () => {} });
    playCueSound({ type: "foul", playerId: "a", fooled: false });
    expect(play).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledWith("foul");
  });

  it("plays a pop per id in reaction order, 120ms apart, plus the dust thud", () => {
    const play = vi.spyOn(audio, "play").mockReturnValue({ stop: () => {} });
    playCueSound({ type: "result", round: 1, pops: ["a", "b", "c"], winners: [] });
    // The dust thud plays right away; the pops are scheduled.
    expect(play).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledWith(quickDrawSounds.refs.dustThud);

    vi.advanceTimersByTime(0);
    expect(play).toHaveBeenCalledWith(quickDrawSounds.refs.popgunPop);
    expect(play).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(popStaggerMs);
    expect(play).toHaveBeenCalledTimes(3);

    vi.advanceTimersByTime(popStaggerMs);
    expect(play).toHaveBeenCalledTimes(4);
    expect(play).not.toHaveBeenCalledWith("celebrate");
  });

  it("celebrates when result has winners", () => {
    const play = vi.spyOn(audio, "play").mockReturnValue({ stop: () => {} });
    playCueSound({ type: "result", round: 1, pops: [], winners: ["a"] });
    expect(play).toHaveBeenCalledWith("celebrate");
  });

  it("plays the round win jingle on over", () => {
    const play = vi.spyOn(audio, "play").mockReturnValue({ stop: () => {} });
    playCueSound({ type: "over" });
    expect(play).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledWith(quickDrawSounds.refs.roundWin);
  });
});
