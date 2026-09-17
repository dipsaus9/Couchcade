import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { CcMashButton } from "../../src/controls/index.ts";
import { css, describeViolations, mountIn, pointer, runAxe } from "../components/helpers.ts";

function mashButton(props: Record<string, unknown> = {}, label = "Mash!") {
  return mountIn(CcMashButton, { props, slots: { default: () => label } });
}

describe("CcMashButton", () => {
  it("sets touch-action: manipulation", () => {
    expect(css(mashButton().element, "touch-action")).toBe("manipulation");
  });

  it("counts each tap and carries the native event with a timestamp", async () => {
    const wrapper = mashButton();
    const el = wrapper.element as HTMLElement;
    for (let i = 0; i < 3; i += 1) {
      pointer(el, "pointerdown");
      pointer(el, "pointerup");
    }
    await nextTick();

    const mashes = wrapper.emitted<[Event, number]>("mash") ?? [];
    expect(mashes.map(([, count]) => count)).toEqual([1, 2, 3]);
    expect(mashes[0]?.[0]).toBeInstanceOf(PointerEvent);
    expect(mashes[0]?.[0].timeStamp).toBeGreaterThanOrEqual(0);
  });

  it("resets the count when reset() is called", async () => {
    const wrapper = mashButton();
    pointer(wrapper.element, "pointerdown");
    await nextTick();

    (wrapper.vm as unknown as { reset: () => void }).reset();
    pointer(wrapper.element, "pointerdown");
    await nextTick();

    const mashes = wrapper.emitted<[Event, number]>("mash") ?? [];
    expect(mashes.map(([, count]) => count)).toEqual([1, 1]);
  });

  it("counts once per keyboard press and ignores repeat", async () => {
    const wrapper = mashButton();
    const el = wrapper.element as HTMLButtonElement;
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, repeat: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await nextTick();

    const mashes = wrapper.emitted<[Event, number]>("mash") ?? [];
    expect(mashes.map(([, count]) => count)).toEqual([1, 2]);
  });

  it("ignores taps when disabled", async () => {
    const wrapper = mashButton({ disabled: true });
    pointer(wrapper.element, "pointerdown");
    await nextTick();
    expect(wrapper.emitted("mash")).toBeUndefined();
  });

  it("has no axe-core violations", async () => {
    expect(describeViolations(await runAxe(mashButton().element))).toEqual([]);
  });
});
