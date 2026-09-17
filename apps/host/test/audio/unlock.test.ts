import { audio } from "@couchcade/audio";
import { afterEach, describe, expect, it, vi } from "vitest";
import { unlockBeforeOpenRoom, watchForUnlock } from "../../src/audio/unlock.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("unlockBeforeOpenRoom", () => {
  it("unlocks before running submit, and returns its result", async () => {
    const unlock = vi.spyOn(audio, "unlock").mockImplementation(() => {});
    const order: string[] = [];
    unlock.mockImplementation(() => order.push("unlock"));
    const submit = vi.fn<() => Promise<string>>(async () => {
      order.push("submit");
      return "error copy";
    });

    await expect(unlockBeforeOpenRoom(submit)).resolves.toBe("error copy");
    expect(order).toEqual(["unlock", "submit"]);
  });

  it("still unlocks when submit is about to report a wrong passcode", async () => {
    const unlock = vi.spyOn(audio, "unlock").mockImplementation(() => {});
    await unlockBeforeOpenRoom(async () => "Wrong passcode");
    expect(unlock).toHaveBeenCalledOnce();
  });

  it("unlocks even when submit returns early, such as the busy or empty-passcode guard", () => {
    const unlock = vi.spyOn(audio, "unlock").mockImplementation(() => {});
    unlockBeforeOpenRoom(() => undefined);
    expect(unlock).toHaveBeenCalledOnce();
  });
});

/** A minimal fake `document`, since apps/host's vitest environment is plain Node. */
function fakeDocument() {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  return {
    listeners,
    addEventListener: vi.fn<
      (type: string, handler: (event: unknown) => void, capture?: boolean) => void
    >((type, handler) => {
      const set = listeners.get(type) ?? new Set();
      set.add(handler);
      listeners.set(type, set);
    }),
    removeEventListener: vi.fn<
      (type: string, handler: (event: unknown) => void, capture?: boolean) => void
    >((type, handler) => {
      listeners.get(type)?.delete(handler);
    }),
    fire(type: string): void {
      for (const handler of listeners.get(type) ?? []) handler({});
    },
  };
}

describe("watchForUnlock", () => {
  it("adds capturing pointerdown and keydown listeners, and unlocks while locked", () => {
    const doc = fakeDocument();
    vi.stubGlobal("document", doc);
    Object.defineProperty(audio, "state", { value: "locked", configurable: true });
    const unlock = vi.spyOn(audio, "unlock").mockImplementation(() => {});

    watchForUnlock();

    expect(doc.addEventListener).toHaveBeenCalledWith("pointerdown", expect.any(Function), true);
    expect(doc.addEventListener).toHaveBeenCalledWith("keydown", expect.any(Function), true);

    doc.fire("pointerdown");
    expect(unlock).toHaveBeenCalledOnce();
  });

  it("does nothing once audio is already running", () => {
    const doc = fakeDocument();
    vi.stubGlobal("document", doc);
    Object.defineProperty(audio, "state", { value: "running", configurable: true });
    const unlock = vi.spyOn(audio, "unlock").mockImplementation(() => {});

    watchForUnlock();
    doc.fire("keydown");

    expect(unlock).not.toHaveBeenCalled();
  });

  it("stops listening once the returned cleanup runs", () => {
    const doc = fakeDocument();
    vi.stubGlobal("document", doc);
    Object.defineProperty(audio, "state", { value: "locked", configurable: true });
    vi.spyOn(audio, "unlock").mockImplementation(() => {});

    const stop = watchForUnlock();
    stop();

    expect(doc.removeEventListener).toHaveBeenCalledWith("pointerdown", expect.any(Function), true);
    expect(doc.removeEventListener).toHaveBeenCalledWith("keydown", expect.any(Function), true);
  });
});
