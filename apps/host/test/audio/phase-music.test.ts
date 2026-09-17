import { audio } from "@couchcade/audio";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyPhaseMusic } from "../../src/audio/phase-music.ts";
import { lobbyLoop } from "../../src/audio/platform-sounds.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("applyPhaseMusic", () => {
  it.each(["lobby", "menu", "motion"] as const)(
    "starts or continues the lobby loop on %s",
    (name) => {
      const music = vi.spyOn(audio, "music").mockImplementation(() => {});
      applyPhaseMusic(name);
      expect(music).toHaveBeenCalledOnce();
      expect(music).toHaveBeenCalledWith(lobbyLoop);
    },
  );

  it("fades the music out over 400ms for calibration", () => {
    const music = vi.spyOn(audio, "music").mockImplementation(() => {});
    applyPhaseMusic("calibration");
    expect(music).toHaveBeenCalledOnce();
    expect(music).toHaveBeenCalledWith(null, { fadeMs: 400 });
  });

  it("plays celebrate and brings the lobby loop back for results", () => {
    const music = vi.spyOn(audio, "music").mockImplementation(() => {});
    const play = vi.spyOn(audio, "play").mockReturnValue({ stop: () => {} });
    applyPhaseMusic("results");
    expect(play).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledWith("celebrate");
    expect(music).toHaveBeenCalledOnce();
    expect(music).toHaveBeenCalledWith(lobbyLoop);
  });

  it.each(["passcode", "playing"] as const)("does nothing on %s", (name) => {
    const music = vi.spyOn(audio, "music").mockImplementation(() => {});
    const play = vi.spyOn(audio, "play").mockReturnValue({ stop: () => {} });
    applyPhaseMusic(name);
    expect(music).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });
});
