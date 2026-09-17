import { describe, expect, it } from "vitest";
import { canvasSize, maxCanvasPixels } from "../src/stage/zoom.ts";

describe("canvasSize", () => {
  it.each([
    // A 1080p TV: the canvas is 1920×1080, shown 1:1.
    [1920, 1080, 1, 1920, 1080],
    // A 4K TV at 200% scaling and at 100%.
    [1920, 1080, 2, 3840, 2160],
    [3840, 2160, 1, 3840, 2160],
    // A 720p TV and a HiDPI laptop window.
    [1280, 720, 1, 1280, 720],
    [1512, 945, 2, 3024, 1890],
    // A browser that reports no pixel ratio, or zooms out below 1.
    [1440, 900, 0, 1440, 900],
    [1440, 900, 0.5, 1440, 900],
  ])("covers a %i×%i window at ratio %d with a %i×%i canvas", (w, h, ratio, width, height) => {
    const size = canvasSize(w, h, ratio);
    expect([size.width, size.height]).toEqual([width, height]);
    expect(size.zoom * size.width).toBeCloseTo(w, 6);
  });

  it("caps the canvas at 4K pixels and lets CSS scale it up", () => {
    const size = canvasSize(2560, 1440, 2);
    expect([size.width, size.height]).toEqual([3840, 2160]);
    expect(size.width * size.height).toBeLessThanOrEqual(maxCanvasPixels);
    expect(size.zoom).toBeCloseTo(2 / 3, 6);

    const wide = canvasSize(3440, 1440, 2);
    expect(wide.width * wide.height).toBeLessThanOrEqual(
      maxCanvasPixels + wide.width + wide.height,
    );
    expect(wide.width / wide.height).toBeCloseTo(3440 / 1440, 2);
  });
});
