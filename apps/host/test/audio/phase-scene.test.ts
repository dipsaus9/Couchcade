import { audio } from "@couchcade/audio";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyPhaseScene } from "../../src/audio/phase-scene.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("applyPhaseScene", () => {
  it("plays the scene token", () => {
    const play = vi.spyOn(audio, "play").mockReturnValue({ stop: () => {} });
    applyPhaseScene();
    expect(play).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledWith("scene");
  });
});
