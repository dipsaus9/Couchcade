import { describe, expect, it } from "vitest";
import { adapterFromHook, motionAdapter, motionHookName } from "../../src/motion/adapter.ts";
import { parseMotionPermissionView } from "../../src/motion/view.ts";

describe("adapterFromHook", () => {
  it("creates the fake adapter with the hook's permission and stores it on the hook", async () => {
    const scope: Record<string, unknown> = { [motionHookName]: { permission: "denied" } };
    const adapter = adapterFromHook(scope);
    expect(adapter).not.toBeNull();
    expect(await adapter?.request()).toBe("denied");
    expect((scope[motionHookName] as { adapter?: unknown }).adapter).toBe(adapter);
    // Every caller shares the one fake.
    expect(adapterFromHook(scope)).toBe(adapter);
  });

  it("returns null without the hook, and ignores an unknown permission", async () => {
    expect(adapterFromHook({})).toBeNull();
    expect(adapterFromHook({ [motionHookName]: null })).toBeNull();
    const fake = adapterFromHook({ [motionHookName]: { permission: "maybe" } });
    expect(await fake?.request()).toBe("granted");
  });

  it("the app's adapter is the fake when a test set the hook, created once", async () => {
    const scope = globalThis as unknown as Record<string, unknown>;
    scope[motionHookName] = { permission: "unsupported" };
    try {
      const adapter = motionAdapter();
      expect(motionAdapter()).toBe(adapter);
      expect(await adapter.request()).toBe("unsupported");
    } finally {
      delete scope[motionHookName];
    }
  });
});

describe("parseMotionPermissionView", () => {
  it("reads the host's view and rejects anything else", () => {
    expect(parseMotionPermissionView({ gameId: "swing", title: "Swing", step: 2 })).toEqual({
      gameId: "swing",
      title: "Swing",
      step: 2,
    });
    expect(parseMotionPermissionView({ gameId: "", title: "Swing", step: 2 })).toBeNull();
    expect(parseMotionPermissionView({ gameId: "swing", title: "Swing", step: 1.5 })).toBeNull();
    expect(parseMotionPermissionView({ gameId: "swing", step: 1 })).toBeNull();
    expect(parseMotionPermissionView([1, 2])).toBeNull();
    expect(parseMotionPermissionView(null)).toBeNull();
  });
});
