import { audio } from "@couchcade/audio";
import type { CouchcadeGame, HostSceneData } from "@couchcade/game-sdk/contract";
import { afterEach, describe, expect, it, vi } from "vitest";
import { attachStage, fontWaitMs, loadStageFonts, phaserStage } from "../../src/runtime/stage.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("loadStageFonts", () => {
  it("asks for every font and weight of the TV type scale", async () => {
    const load = vi.fn<(face: string) => Promise<FontFace[]>>(async () => []);
    vi.stubGlobal("document", { fonts: { load } });
    await loadStageFonts();
    const faces = load.mock.calls.map(([face]) => face);
    expect(faces).toHaveLength(3);
    expect(faces.some((face) => face.startsWith('700 32px "Pixelify Sans"'))).toBe(true);
    expect(faces.some((face) => face.startsWith('500 32px "Fredoka"'))).toBe(true);
    expect(faces.some((face) => face.startsWith('700 32px "Fredoka"'))).toBe(true);
  });

  it("starts the game anyway when a font fails or never loads", async () => {
    vi.stubGlobal("document", { fonts: { load: () => Promise.reject(new Error("offline")) } });
    await expect(loadStageFonts()).resolves.toBeUndefined();

    vi.useFakeTimers();
    vi.stubGlobal("document", { fonts: { load: () => new Promise(() => {}) } });
    const waiting = loadStageFonts();
    await vi.advanceTimersByTimeAsync(fontWaitMs);
    await expect(waiting).resolves.toBeUndefined();
  });
});

describe("phaserStage.start", () => {
  it("fades the lobby loop out right before adding the game's scene (audio.md 'What plays when')", async () => {
    function FakeScene(): void {}
    const add = vi.fn<(id: string, scene: unknown, autoStart: boolean, data: unknown) => void>();
    const fakeGame = {
      scene: {
        add,
        getScene: vi.fn<(id: string) => unknown>(),
        remove: vi.fn<(id: string) => void>(),
      },
    };
    attachStage(fakeGame as unknown as Parameters<typeof attachStage>[0]);

    const game = {
      id: "echo",
      hostScene: () => Promise.resolve(FakeScene as unknown as new () => never),
    } as unknown as CouchcadeGame;
    const data: HostSceneData<unknown> = {
      getState: () => undefined,
      players: [],
      displayLagMs: 0,
      reducedMotion: false,
    };

    const music = vi.spyOn(audio, "music").mockImplementation(() => {});
    await phaserStage.start(game, data);

    expect(music).toHaveBeenCalledWith(null);
    expect(add).toHaveBeenCalledWith("echo", FakeScene, true, data);
    // The music faded before the scene was handed to Phaser, not after.
    expect(music.mock.invocationCallOrder[0]!).toBeLessThan(add.mock.invocationCallOrder[0]!);
  });
});
