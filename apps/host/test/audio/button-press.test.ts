import { audio } from "@couchcade/audio";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isButtonClick, watchButtonPresses } from "../../src/audio/button-press.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** A fake DOM node with just enough of `Element` for `isButtonClick`'s `closest` check. */
function fakeNode(classes: string[]): { closest: (selector: string) => unknown } {
  return {
    closest: (selector: string) => {
      const className = selector.replace(/^\./, "");
      return classes.includes(className) ? fakeNode(classes) : null;
    },
  };
}

describe("isButtonClick", () => {
  it("is false for null", () => {
    expect(isButtonClick(null)).toBe(false);
  });

  it("is false for something with no closest (not a real DOM element)", () => {
    expect(isButtonClick({} as EventTarget)).toBe(false);
  });

  it("is true for a .cc-button itself", () => {
    expect(isButtonClick(fakeNode(["cc-button"]) as unknown as EventTarget)).toBe(true);
  });

  it("is true for a descendant of a .cc-button (an icon or label inside it), via closest()", () => {
    const icon = { closest: () => fakeNode(["cc-button"]) };
    expect(isButtonClick(icon as unknown as EventTarget)).toBe(true);
  });

  it("is false for something else entirely, such as a panel", () => {
    expect(isButtonClick(fakeNode(["cc-panel"]) as unknown as EventTarget)).toBe(false);
  });
});

/** A minimal fake `document`, mirrors ../audio/unlock.test.ts's helper. */
function fakeDocument() {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  return {
    addEventListener: vi.fn<(type: string, handler: (event: unknown) => void) => void>(
      (type, handler) => {
        const set = listeners.get(type) ?? new Set();
        set.add(handler);
        listeners.set(type, set);
      },
    ),
    removeEventListener: vi.fn<(type: string, handler: (event: unknown) => void) => void>(
      (type, handler) => {
        listeners.get(type)?.delete(handler);
      },
    ),
    fire(type: string, event: unknown): void {
      for (const handler of listeners.get(type) ?? []) handler(event);
    },
  };
}

describe("watchButtonPresses", () => {
  it("plays press on a click inside a .cc-button", () => {
    const doc = fakeDocument();
    vi.stubGlobal("document", doc);
    const play = vi.spyOn(audio, "play").mockReturnValue({ stop: () => {} });

    watchButtonPresses();
    doc.fire("click", { target: fakeNode(["cc-button"]) });

    expect(play).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledWith("press");
  });

  it("does nothing for a click outside any .cc-button", () => {
    const doc = fakeDocument();
    vi.stubGlobal("document", doc);
    const play = vi.spyOn(audio, "play").mockReturnValue({ stop: () => {} });

    watchButtonPresses();
    doc.fire("click", { target: fakeNode(["frame"]) });

    expect(play).not.toHaveBeenCalled();
  });

  it("stops listening once the returned cleanup runs", () => {
    const doc = fakeDocument();
    vi.stubGlobal("document", doc);
    const play = vi.spyOn(audio, "play").mockReturnValue({ stop: () => {} });

    const stop = watchButtonPresses();
    stop();
    doc.fire("click", { target: fakeNode(["cc-button"]) });

    expect(play).not.toHaveBeenCalled();
    expect(doc.removeEventListener).toHaveBeenCalledWith("click", expect.any(Function));
  });
});
