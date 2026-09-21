import { describe, expect, it, vi } from "vitest";
import { watchNetwork, type NetworkSource } from "../../src/errors/network.ts";

function fakeNetwork(onLine: boolean): NetworkSource & { fire(type: "online" | "offline"): void } {
  const listeners: Record<string, Array<() => void>> = { online: [], offline: [] };
  return {
    onLine,
    addEventListener: (type, listener) => listeners[type]!.push(listener),
    removeEventListener: (type, listener) => {
      listeners[type] = listeners[type]!.filter((l) => l !== listener);
    },
    fire: (type) => listeners[type]!.forEach((listener) => listener()),
  };
}

describe("watchNetwork", () => {
  it("starts from the browser's current online state", () => {
    expect(watchNetwork(() => {}, fakeNetwork(true)).isOffline()).toBe(false);
    expect(watchNetwork(() => {}, fakeNetwork(false)).isOffline()).toBe(true);
  });

  it("calls onChange when the browser flips offline and back online", () => {
    const source = fakeNetwork(true);
    const onChange = vi.fn<(offline: boolean) => void>();
    const watch = watchNetwork(onChange, source);

    source.fire("offline");
    expect(watch.isOffline()).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(true);

    source.fire("online");
    expect(watch.isOffline()).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("stops listening once disposed", () => {
    const source = fakeNetwork(true);
    const onChange = vi.fn<(offline: boolean) => void>();
    const watch = watchNetwork(onChange, source);
    watch.dispose();
    source.fire("offline");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("defaults to online when there's no browser source at all", () => {
    expect(watchNetwork(() => {}, null).isOffline()).toBe(false);
  });
});
