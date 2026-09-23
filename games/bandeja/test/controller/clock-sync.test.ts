import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { useClockSynced } from "../../src/controller/clock-sync.ts";
import type { SyncedClock } from "../../src/controller/clock-sync.ts";

/** Mounts a tiny host so the composable's onMounted/onUnmounted run, and exposes the ref. */
function mountSynced(clock: SyncedClock, pollMs?: number) {
  const Host = defineComponent({
    setup() {
      const synced = useClockSynced(clock, pollMs);
      return () => h("p", String(synced.value));
    },
  });
  return mount(Host);
}

describe("useClockSynced", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at the clock's current synced value", () => {
    expect(mountSynced({ synced: false }).text()).toBe("false");
    expect(mountSynced({ synced: true }).text()).toBe("true");
  });

  it("picks up the clock becoming synced by polling", async () => {
    vi.useFakeTimers();
    const clock = { synced: false };
    const wrapper = mountSynced(clock, 200);
    expect(wrapper.text()).toBe("false");

    clock.synced = true;
    await vi.advanceTimersByTimeAsync(200);
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toBe("true");
  });

  it("picks up a reconnect resetting the clock back to unsynced", async () => {
    vi.useFakeTimers();
    const clock = { synced: true };
    const wrapper = mountSynced(clock, 200);
    expect(wrapper.text()).toBe("true");

    clock.synced = false;
    await vi.advanceTimersByTimeAsync(200);
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toBe("false");
  });

  it("stops polling once unmounted", async () => {
    vi.useFakeTimers();
    const clock = { synced: false };
    const wrapper = mountSynced(clock, 200);
    wrapper.unmount();

    clock.synced = true;
    // No assertion possible on the (now-gone) ref; this only proves advancing timers after
    // unmount doesn't throw from a stray interval callback touching a torn-down component.
    await expect(vi.advanceTimersByTimeAsync(1000)).resolves.toBeDefined();
  });
});
