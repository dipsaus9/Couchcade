import { describe, expect, it, vi } from "vitest";
import {
  enterMotionFullscreen,
  exitMotionFullscreen,
  phonePlatform,
  type FullscreenDocument,
} from "../../src/motion/platform.ts";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const iphoneUa =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const pixelUa =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const macUa =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

describe("phonePlatform", () => {
  it("tells iPhones, iPads asking for desktop pages, Android phones and the rest apart", () => {
    expect(phonePlatform({ userAgent: iphoneUa, maxTouchPoints: 5 })).toBe("iphone");
    expect(phonePlatform({ userAgent: macUa, maxTouchPoints: 5 })).toBe("iphone");
    expect(phonePlatform({ userAgent: macUa, maxTouchPoints: 0 })).toBe("other");
    expect(phonePlatform({ userAgent: pixelUa, maxTouchPoints: 5 })).toBe("android");
  });
});

function fakeFullscreen({ fails = false } = {}) {
  const lock = vi.fn<(orientation: "portrait") => Promise<void>>(async () => {});
  const unlock = vi.fn<() => void>();
  const doc = {
    fullscreenElement: null as Element | null,
    documentElement: {
      requestFullscreen: vi.fn<(options?: FullscreenOptions) => Promise<void>>(async () => {
        if (fails) throw new TypeError("Permissions check failed");
        doc.fullscreenElement = {} as Element;
      }),
    },
    exitFullscreen: vi.fn<() => Promise<void>>(async () => {
      doc.fullscreenElement = null;
    }),
  };
  return { doc, screen: { orientation: { lock, unlock } }, lock, unlock };
}

describe("enterMotionFullscreen and exitMotionFullscreen", () => {
  it("goes fullscreen and locks portrait on Android, then undoes both", async () => {
    const { doc, screen, lock, unlock } = fakeFullscreen();
    enterMotionFullscreen("android", doc as FullscreenDocument, screen);
    await flush();
    expect(doc.documentElement.requestFullscreen).toHaveBeenCalledWith({ navigationUI: "hide" });
    expect(lock).toHaveBeenCalledWith("portrait");

    exitMotionFullscreen(doc as FullscreenDocument, screen);
    await flush();
    expect(unlock).toHaveBeenCalled();
    expect(doc.exitFullscreen).toHaveBeenCalled();
    expect(doc.fullscreenElement).toBeNull();
  });

  it("does nothing on iPhones and other phones, and leaves a page that isn't fullscreen alone", async () => {
    const { doc, screen, lock } = fakeFullscreen();
    enterMotionFullscreen("iphone", doc as FullscreenDocument, screen);
    enterMotionFullscreen("other", doc as FullscreenDocument, screen);
    await flush();
    expect(doc.documentElement.requestFullscreen).not.toHaveBeenCalled();
    expect(lock).not.toHaveBeenCalled();
    exitMotionFullscreen(doc as FullscreenDocument, screen);
    expect(doc.exitFullscreen).not.toHaveBeenCalled();
  });

  it("ignores a refused fullscreen and a browser without it", async () => {
    const { doc, screen, lock } = fakeFullscreen({ fails: true });
    expect(() => enterMotionFullscreen("android", doc as FullscreenDocument, screen)).not.toThrow();
    await flush();
    expect(lock).not.toHaveBeenCalled();
    expect(() => enterMotionFullscreen("android", { documentElement: {} }, {})).not.toThrow();
  });
});
