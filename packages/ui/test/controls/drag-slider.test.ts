import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { CcDragSlider } from "../../src/controls/index.ts";
import { css, describeViolations, mountIn, runAxe } from "../components/helpers.ts";

function dispatch(el: Element, type: string, init: PointerEventInit = {}): void {
  el.dispatchEvent(
    new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, ...init }),
  );
}

describe("CcDragSlider", () => {
  it("sets touch-action: manipulation", () => {
    const el = mountIn(CcDragSlider, { props: { modelValue: 0.5 } }).element;
    expect(css(el, "touch-action")).toBe("manipulation");
  });

  it("jumps to an absolute position on tap, at either end of the track", async () => {
    const wrapper = mountIn(CcDragSlider, { props: { modelValue: 0.5 } });
    const el = wrapper.element;
    const rect = el.getBoundingClientRect();
    const y = rect.top + rect.height / 2;

    dispatch(el, "pointerdown", { clientX: rect.left, clientY: y });
    await nextTick();
    expect(wrapper.emitted<[number]>("update:modelValue")?.at(-1)?.[0]).toBeCloseTo(0, 1);

    dispatch(el, "pointerup", { clientX: rect.left, clientY: y });
    dispatch(el, "pointerdown", { clientX: rect.right, clientY: y });
    await nextTick();
    expect(wrapper.emitted<[number]>("update:modelValue")?.at(-1)?.[0]).toBeCloseTo(1, 1);
  });

  it("follows a drag across the track, clamped to 0-1", async () => {
    const wrapper = mountIn(CcDragSlider, { props: { modelValue: 0 } });
    const el = wrapper.element;
    const rect = el.getBoundingClientRect();
    const y = rect.top + rect.height / 2;

    dispatch(el, "pointerdown", { clientX: rect.left, clientY: y });
    dispatch(el, "pointermove", { clientX: rect.left + rect.width / 2, clientY: y });
    // Dragging past the track's edge clamps, it never reports out of range.
    dispatch(el, "pointermove", { clientX: rect.right + 500, clientY: y });
    await nextTick();

    const values = wrapper.emitted<[number]>("update:modelValue") ?? [];
    expect(values.at(-2)?.[0]).toBeCloseTo(0.5, 1);
    expect(values.at(-1)?.[0]).toBe(1);
  });

  it("steps with arrow keys and jumps to the ends with Home and End", async () => {
    const wrapper = mountIn(CcDragSlider, { props: { modelValue: 0.5, step: 0.1 } });
    const el = wrapper.element as HTMLElement;

    el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await nextTick();
    expect(wrapper.emitted<[number]>("update:modelValue")?.[0]?.[0]).toBeCloseTo(0.6, 5);

    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    await nextTick();
    expect(wrapper.emitted<[number]>("update:modelValue")?.at(-1)?.[0]).toBe(0);

    el.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    await nextTick();
    expect(wrapper.emitted<[number]>("update:modelValue")?.at(-1)?.[0]).toBe(1);
  });

  it("moves the fill to match modelValue", () => {
    const wrapper = mountIn(CcDragSlider, { props: { modelValue: 0.25 } });
    const track = wrapper.element.getBoundingClientRect();
    const fill = wrapper.element.querySelector(".cc-drag-slider__fill") as HTMLElement;
    expect(Math.abs(fill.getBoundingClientRect().width - track.width * 0.25)).toBeLessThan(2);
  });

  it("supports a vertical orientation, 0 at the bottom and 1 at the top", async () => {
    const wrapper = mountIn(CcDragSlider, { props: { modelValue: 0, orientation: "vertical" } });
    const el = wrapper.element;
    const rect = el.getBoundingClientRect();

    dispatch(el, "pointerdown", { clientX: rect.left + rect.width / 2, clientY: rect.top });
    await nextTick();
    expect(wrapper.emitted<[number]>("update:modelValue")?.at(-1)?.[0]).toBeCloseTo(1, 1);
  });

  it("ignores input when disabled", async () => {
    const wrapper = mountIn(CcDragSlider, { props: { modelValue: 0.5, disabled: true } });
    const rect = wrapper.element.getBoundingClientRect();
    dispatch(wrapper.element, "pointerdown", { clientX: rect.left, clientY: rect.top });
    await nextTick();
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("has no axe-core violations", async () => {
    const el = mountIn(CcDragSlider, {
      props: { modelValue: 0.5, label: "Paddle position" },
    }).element;
    expect(describeViolations(await runAxe(el))).toEqual([]);
  });
});
