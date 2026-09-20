import { audio } from "@couchcade/audio";
import { afterEach, describe, expect, it, vi } from "vitest";
import { playCueSound, targetRangeSounds } from "../../src/host/sounds.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("targetRangeSounds", () => {
  it("has a src, bus and visual for every sound, owned by target-range", () => {
    for (const ref of Object.values(targetRangeSounds.refs)) {
      expect(ref.owner).toBe("target-range");
      expect(ref.def.src.length).toBeGreaterThan(0);
      expect(["effects", "music"]).toContain(ref.def.bus);
      expect(ref.def.visual.length).toBeGreaterThan(0);
    }
  });
});

describe("playCueSound", () => {
  it("starts the game music loop and the round start jingle on round 1, without wind", () => {
    const music = vi.spyOn(audio, "music").mockImplementation(() => {});
    const play = vi.spyOn(audio, "play").mockReturnValue({ stop: () => {} });
    playCueSound({ type: "round", round: 1 });
    expect(music).toHaveBeenCalledOnce();
    expect(music).toHaveBeenCalledWith(targetRangeSounds.refs.gameMusicLoop);
    expect(play).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledWith(targetRangeSounds.refs.roundStart);
  });

  it("also starts the wind loop from round 2", () => {
    vi.spyOn(audio, "music").mockImplementation(() => {});
    const play = vi.spyOn(audio, "play").mockReturnValue({ stop: () => {} });
    playCueSound({ type: "round", round: 2 });
    expect(play).toHaveBeenCalledTimes(2);
    expect(play).toHaveBeenCalledWith(targetRangeSounds.refs.wind);
  });

  it("ducks the music on open and releases the duck on reveal", () => {
    const release = vi.fn<() => void>();
    const duck = vi.spyOn(audio, "duck").mockReturnValue(release);
    playCueSound({ type: "open", volley: 1 });
    expect(duck).toHaveBeenCalledOnce();
    expect(duck).toHaveBeenCalledWith({ level: 0.5 });

    vi.spyOn(audio, "play").mockReturnValue({ stop: () => {} });
    playCueSound({ type: "reveal", volley: 1, bullseye: false });
    expect(release).toHaveBeenCalledOnce();
  });

  it("plays the draw creak on draw", () => {
    const play = vi.spyOn(audio, "play").mockReturnValue({ stop: () => {} });
    playCueSound({ type: "draw", playerId: "a" });
    expect(play).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledWith(targetRangeSounds.refs.drawCreak);
  });

  it("plays the release twang then the arrow whoosh on shoot", () => {
    const play = vi.spyOn(audio, "play").mockReturnValue({ stop: () => {} });
    playCueSound({ type: "shoot", playerId: "a" });
    expect(play).toHaveBeenNthCalledWith(1, targetRangeSounds.refs.releaseTwang);
    expect(play).toHaveBeenNthCalledWith(2, targetRangeSounds.refs.arrowWhoosh);
  });

  it("plays the straw thud for a scoring arrow and the fence thud for a miss", () => {
    const play = vi.spyOn(audio, "play").mockReturnValue({ stop: () => {} });
    playCueSound({ type: "land", playerId: "a", points: 5 });
    expect(play).toHaveBeenCalledWith(targetRangeSounds.refs.arrowThudStraw);
    playCueSound({ type: "land", playerId: "a", points: 0 });
    expect(play).toHaveBeenCalledWith(targetRangeSounds.refs.arrowThudFence);
  });

  it("plays the clock tick on tick", () => {
    const play = vi.spyOn(audio, "play").mockReturnValue({ stop: () => {} });
    playCueSound({ type: "tick", seconds: 3 });
    expect(play).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledWith(targetRangeSounds.refs.clockTick);
  });

  it("dings and celebrates a bullseye reveal, but stays quiet without one", () => {
    vi.spyOn(audio, "duck").mockReturnValue(() => {});
    const play = vi.spyOn(audio, "play").mockReturnValue({ stop: () => {} });
    playCueSound({ type: "reveal", volley: 1, bullseye: false });
    expect(play).not.toHaveBeenCalled();
    playCueSound({ type: "reveal", volley: 2, bullseye: true });
    expect(play).toHaveBeenCalledWith(targetRangeSounds.refs.bullseyeDing);
    expect(play).toHaveBeenCalledWith("celebrate");
  });

  it("stops the wind loop on roundEnd", () => {
    vi.spyOn(audio, "music").mockImplementation(() => {});
    const stop = vi.fn<() => void>();
    vi.spyOn(audio, "play").mockImplementation((sound) =>
      sound === targetRangeSounds.refs.wind ? { stop } : { stop: () => {} },
    );
    playCueSound({ type: "round", round: 2 }); // starts the wind loop
    playCueSound({ type: "roundEnd", round: 2 });
    expect(stop).toHaveBeenCalledOnce();
  });

  it("plays the match end jingle on over", () => {
    const play = vi.spyOn(audio, "play").mockReturnValue({ stop: () => {} });
    playCueSound({ type: "over" });
    expect(play).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledWith(targetRangeSounds.refs.matchEnd);
  });
});
