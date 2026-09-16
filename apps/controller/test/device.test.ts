import { describe, expect, it, vi } from "vitest";
import {
  keepScreenAwake,
  lockPortrait,
  type VisibilityDocument,
  type WakeLockNavigator,
} from "../src/device/screen.ts";
import { clearSession, loadSession, saveSession, sessionKey } from "../src/session/storage.ts";

function fakeDocument() {
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  const show = () => listeners.forEach((listener) => listener());
  return { doc: doc as unknown as VisibilityDocument, show, listeners };
}

type WakeLockRequest = NonNullable<WakeLockNavigator["wakeLock"]>["request"];

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("keepScreenAwake", () => {
  it("requests a screen wake lock and asks again when the page is visible", async () => {
    const release = vi.fn<() => Promise<void>>(async () => {});
    const request = vi.fn<WakeLockRequest>(async () => ({ release }));
    const { doc, show } = fakeDocument();

    const stop = keepScreenAwake({ wakeLock: { request } }, doc);
    await flush();
    expect(request).toHaveBeenCalledWith("screen");

    show();
    await flush();
    expect(request).toHaveBeenCalledTimes(2);

    stop();
    expect(release).toHaveBeenCalled();
  });

  it("ignores a refused lock", async () => {
    const request = vi.fn<WakeLockRequest>(async () => {
      throw new DOMException("Not allowed", "NotAllowedError");
    });
    const { doc } = fakeDocument();
    const stop = keepScreenAwake({ wakeLock: { request } }, doc);
    await flush();
    expect(request).toHaveBeenCalled();
    expect(() => stop()).not.toThrow();
  });

  it("does nothing on a browser without the Wake Lock API", async () => {
    const { doc, listeners } = fakeDocument();
    const stop = keepScreenAwake({}, doc);
    await flush();
    stop();
    expect(listeners.size).toBe(0);
  });
});

describe("lockPortrait", () => {
  it("ignores a refused or missing orientation lock", async () => {
    const lock = vi.fn<(orientation: "portrait") => Promise<void>>(async () => {
      throw new DOMException("Not supported", "NotSupportedError");
    });
    expect(() => lockPortrait({ orientation: { lock } })).not.toThrow();
    expect(lock).toHaveBeenCalledWith("portrait");
    expect(() => lockPortrait({})).not.toThrow();
    await flush();
  });
});

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

describe("session storage", () => {
  it("keeps { code, playerId, rejoinToken } under couchcade:session", () => {
    const storage = memoryStorage();
    const session = { code: "BEAN", playerId: "ABCDEFGH", rejoinToken: "r.sig" };
    saveSession(storage, session);
    expect(JSON.parse(storage.items.get(sessionKey) ?? "")).toEqual(session);
    expect(loadSession(storage)).toEqual(session);
    clearSession(storage);
    expect(loadSession(storage)).toBeNull();
  });

  it("ignores a damaged entry or blocked storage", () => {
    const storage = memoryStorage();
    storage.setItem(sessionKey, "{not json");
    expect(loadSession(storage)).toBeNull();
    storage.setItem(sessionKey, JSON.stringify({ code: "nope", playerId: "A", rejoinToken: "r" }));
    expect(loadSession(storage)).toBeNull();

    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(loadSession(blocked)).toBeNull();
    expect(() =>
      saveSession(blocked, { code: "BEAN", playerId: "A", rejoinToken: "r" }),
    ).not.toThrow();
    expect(() => clearSession(null)).not.toThrow();
  });
});
