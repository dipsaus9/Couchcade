import { afterEach, describe, expect, it, vi } from "vitest";
import { fontWaitMs, loadStageFonts } from "../../src/runtime/stage.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
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
