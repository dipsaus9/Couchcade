import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { CcDpad } from "../../src/controls/index.ts";
import type { DpadDirection } from "../../src/controls/index.ts";
import { css, describeViolations, mountIn, pointer, runAxe } from "../components/helpers.ts";

const directions: readonly DpadDirection[] = ["up", "down", "left", "right"];

function dpad(props: Record<string, unknown> = {}) {
  return mountIn(CcDpad, { props });
}

function segment(el: Element, direction: DpadDirection): HTMLElement {
  return el.querySelector(`.cc-dpad__button--${direction}`) as HTMLElement;
}

describe("CcDpad", () => {
  it("lays out four direction buttons in a cross, each at least 56px", () => {
    const el = dpad().element;
    for (const direction of directions) {
      const rect = segment(el, direction).getBoundingClientRect();
      expect(rect.width).toBeGreaterThanOrEqual(56);
      expect(rect.height).toBeGreaterThanOrEqual(56);
    }
    expect(segment(el, "up").getBoundingClientRect().top).toBeLessThan(
      segment(el, "down").getBoundingClientRect().top,
    );
    expect(segment(el, "left").getBoundingClientRect().left).toBeLessThan(
      segment(el, "right").getBoundingClientRect().left,
    );
  });

  it("sets touch-action: manipulation", () => {
    expect(css(dpad().element, "touch-action")).toBe("manipulation");
  });

  it.each(directions)(
    "presses and releases %s independently via pointer events",
    async (direction) => {
      const wrapper = dpad();
      const button = segment(wrapper.element, direction);

      pointer(button, "pointerdown");
      await nextTick();
      expect(wrapper.emitted("press")?.[0]).toEqual([direction, expect.any(PointerEvent)]);
      expect(button.classList).toContain("is-pressed");

      pointer(button, "pointerup");
      await nextTick();
      expect(wrapper.emitted("release")?.[0]).toEqual([direction, expect.any(PointerEvent)]);
      expect(button.classList).not.toContain("is-pressed");
    },
  );

  it("holds two directions at once for a diagonal", async () => {
    const wrapper = dpad();
    const up = segment(wrapper.element, "up");
    const right = segment(wrapper.element, "right");

    pointer(up, "pointerdown");
    pointer(right, "pointerdown");
    await nextTick();
    expect(up.classList).toContain("is-pressed");
    expect(right.classList).toContain("is-pressed");
    expect(wrapper.emitted("press")).toHaveLength(2);
  });

  it("presses and releases from the matching arrow key", async () => {
    const wrapper = dpad();
    const el = wrapper.element as HTMLElement;

    el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    await nextTick();
    expect(wrapper.emitted("press")?.[0]).toEqual(["up", expect.any(KeyboardEvent)]);
    expect(segment(el, "up").classList).toContain("is-pressed");

    el.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowUp", bubbles: true }));
    await nextTick();
    expect(wrapper.emitted("release")?.[0]).toEqual(["up", expect.any(KeyboardEvent)]);
  });

  it("ignores key repeat, so a held arrow key fires one press", async () => {
    const wrapper = dpad();
    const el = wrapper.element as HTMLElement;
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, repeat: true }),
    );
    await nextTick();
    expect(wrapper.emitted("press")).toHaveLength(1);
  });

  it("ignores presses and drops depth when disabled", async () => {
    const wrapper = dpad({ disabled: true });
    const button = segment(wrapper.element, "up") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    pointer(button, "pointerdown");
    await nextTick();
    expect(wrapper.emitted("press")).toBeUndefined();
  });

  it("has no axe-core violations", async () => {
    expect(describeViolations(await runAxe(dpad().element))).toEqual([]);
  });
});
