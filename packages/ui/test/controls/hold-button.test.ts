import { color } from "@couchcade/theme";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { CcHoldButton } from "../../src/controls/index.ts";
import { css, describeViolations, mountIn, pointer, rgb, runAxe } from "../components/helpers.ts";

function holdButton(props: Record<string, unknown> = {}, label = "Hold to aim") {
  return mountIn(CcHoldButton, { props, slots: { default: () => label } });
}

describe("CcHoldButton", () => {
  it("sets touch-action: manipulation", () => {
    expect(css(holdButton().element, "touch-action")).toBe("manipulation");
  });

  it("fires press on pointerdown and release on pointerup, carrying the native event", async () => {
    const wrapper = holdButton();
    const el = wrapper.element as HTMLElement;

    pointer(el, "pointerdown");
    await nextTick();
    const [pressEvent] = wrapper.emitted<[Event]>("press")?.[0] ?? [];
    expect(pressEvent).toBeInstanceOf(PointerEvent);
    expect(pressEvent?.timeStamp).toBeGreaterThanOrEqual(0);
    expect(el.classList).toContain("is-pressed");

    pointer(el, "pointerup");
    await nextTick();
    expect(wrapper.emitted("release")).toHaveLength(1);
    expect(el.classList).not.toContain("is-pressed");
  });

  it("keeps holding when the pointer strays (pointer capture), unlike a plain tap button", async () => {
    const wrapper = holdButton();
    const el = wrapper.element as HTMLElement;
    pointer(el, "pointerdown");
    await nextTick();
    // CcButton listens for pointerleave to end a press; CcHoldButton doesn't, because the
    // pointer is captured for the whole hold.
    el.dispatchEvent(new Event("pointerleave", { bubbles: true }));
    await nextTick();
    expect(wrapper.emitted("release")).toBeUndefined();
    expect(el.classList).toContain("is-pressed");
    pointer(el, "pointerup");
  });

  it("holds and releases once from the keyboard, ignoring repeat", async () => {
    const wrapper = holdButton();
    const el = wrapper.element as HTMLButtonElement;
    el.focus();
    el.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, repeat: true }));
    await nextTick();
    expect(wrapper.emitted("press")).toHaveLength(1);

    el.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }));
    await nextTick();
    expect(wrapper.emitted("release")).toHaveLength(1);
  });

  it("releases a held press when it becomes disabled mid-hold", async () => {
    const wrapper = holdButton();
    pointer(wrapper.element, "pointerdown");
    await wrapper.setProps({ disabled: true });
    expect(wrapper.emitted("release")).toHaveLength(1);
  });

  it.each([
    ["primary", color.sunny],
    ["go", color.turf],
    ["stop", color.signal],
    ["quiet", color.chalk],
  ] as const)("draws the %s fill, like CcButton", (variant, fill) => {
    expect(css(holdButton({ variant }).element, "background-color")).toBe(rgb(fill));
  });

  it("has no axe-core violations", async () => {
    expect(describeViolations(await runAxe(holdButton().element))).toEqual([]);
  });
});
