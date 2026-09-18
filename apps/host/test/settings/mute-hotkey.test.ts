import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isMuteHotkey,
  isTextFieldFocused,
  watchMuteHotkey,
} from "../../src/settings/mute-hotkey.ts";

function keyEvent(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key: "m",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  } as KeyboardEvent;
}

describe("isMuteHotkey", () => {
  it("matches a plain m, either case", () => {
    expect(isMuteHotkey(keyEvent({ key: "m" }))).toBe(true);
    expect(isMuteHotkey(keyEvent({ key: "M" }))).toBe(true);
  });

  it("ignores every other key", () => {
    expect(isMuteHotkey(keyEvent({ key: "n" }))).toBe(false);
  });

  it.each(["altKey", "ctrlKey", "metaKey", "shiftKey"] as const)(
    "ignores m held with %s, some other shortcut",
    (modifier) => {
      expect(isMuteHotkey(keyEvent({ [modifier]: true }))).toBe(false);
    },
  );
});

describe("isTextFieldFocused", () => {
  it("is false with nothing focused", () => {
    expect(isTextFieldFocused(null)).toBe(false);
  });

  it.each(["INPUT", "TEXTAREA", "SELECT"])("is true for a focused %s", (tagName) => {
    expect(isTextFieldFocused({ tagName } as Element)).toBe(true);
  });

  it("is true for a contenteditable element", () => {
    const el = { tagName: "DIV", isContentEditable: true } as unknown as Element;
    expect(isTextFieldFocused(el)).toBe(true);
  });

  it("is false for anything else, such as a button", () => {
    expect(isTextFieldFocused({ tagName: "BUTTON" } as Element)).toBe(false);
  });
});

/**
 * A minimal fake `document`, since apps/host's vitest environment is plain Node (mirrors
 * ../audio/unlock.test.ts's helper), extended with a settable `activeElement` and a `fire` that
 * forwards a real event payload instead of `{}`.
 */
function fakeDocument(activeElement: Element | null = null) {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  return {
    activeElement,
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("watchMuteHotkey", () => {
  it("toggles on a plain m keydown", () => {
    const doc = fakeDocument();
    vi.stubGlobal("document", doc);
    const toggle = vi.fn<() => void>();

    watchMuteHotkey(toggle);
    doc.fire("keydown", keyEvent());

    expect(toggle).toHaveBeenCalledOnce();
  });

  it("does not toggle while a text field has focus, so a passcode with an m in it just types", () => {
    const doc = fakeDocument({ tagName: "INPUT" } as Element);
    vi.stubGlobal("document", doc);
    const toggle = vi.fn<() => void>();

    watchMuteHotkey(toggle);
    doc.fire("keydown", keyEvent());

    expect(toggle).not.toHaveBeenCalled();
  });

  it("ignores an unrelated key", () => {
    const doc = fakeDocument();
    vi.stubGlobal("document", doc);
    const toggle = vi.fn<() => void>();

    watchMuteHotkey(toggle);
    doc.fire("keydown", keyEvent({ key: "n" }));

    expect(toggle).not.toHaveBeenCalled();
  });

  it("stops listening once the returned cleanup runs", () => {
    const doc = fakeDocument();
    vi.stubGlobal("document", doc);
    const toggle = vi.fn<() => void>();

    const stop = watchMuteHotkey(toggle);
    stop();
    doc.fire("keydown", keyEvent());

    expect(toggle).not.toHaveBeenCalled();
  });
});
