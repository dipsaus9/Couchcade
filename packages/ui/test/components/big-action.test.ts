import { color, tint } from "@couchcade/theme";
import { describe, expect, it } from "vitest";
import { commands, userEvent } from "vitest/browser";
import { nextTick } from "vue";
import { CcBigAction } from "../../src/components/index.ts";
import type { BigActionState } from "../../src/components/index.ts";
import {
  contrastPassed,
  css,
  describeViolations,
  mountIn,
  pointer,
  rgb,
  runAxe,
} from "./helpers.ts";

const states: Record<BigActionState, { fill: string; text: string; label: string }> = {
  waiting: { fill: color.chalk, text: color.ink, label: "Watch the TV" },
  "dont-tap": { fill: color.signal, text: color.chalk, label: "Wait…" },
  "act-now": { fill: color.turf, text: color.chalk, label: "Tap!" },
  hold: { fill: color.sunny, text: color.ink, label: "Hold to aim" },
  disabled: { fill: color.chalk, text: tint.ink45, label: "—" },
};
const names = Object.keys(states) as BigActionState[];

function bigAction(state: BigActionState) {
  return mountIn(CcBigAction, { props: { state, label: states[state].label } });
}

const labelOf = (el: Element): Element => el.querySelector(".cc-big-action__label") ?? el;

describe("CcBigAction", () => {
  it.each(names)("shows the %s state with its fill and label colour", (state) => {
    const el = bigAction(state).element;
    expect(css(el, "background-color")).toBe(rgb(states[state].fill));
    expect(css(labelOf(el), "color")).toBe(rgb(states[state].text));
    expect(el.textContent).toBe(states[state].label);
  });

  it("is a circle about 85% of the phone's width", () => {
    const el = bigAction("act-now").element;
    const parent = el.parentElement as HTMLElement;
    const frame =
      parent.clientWidth -
      parseFloat(css(parent, "padding-left")) -
      parseFloat(css(parent, "padding-right"));
    const { width, height } = el.getBoundingClientRect();
    expect(width).toBeCloseTo(frame * 0.85, 0);
    expect(height).toBeCloseTo(width, 0);
    expect(css(el, "border-top-left-radius")).toBe("50%");
  });

  it.each(["waiting", "dont-tap", "act-now", "hold"] as const)(
    "has the outline and depth while %s",
    (state) => {
      const el = bigAction(state).element;
      expect(css(el, "border-top-color")).toBe(rgb(color.ink));
      expect(css(el, "box-shadow")).toBe(`${rgb(color.ink)} 0px 6px 0px 0px`);
    },
  );

  it("drops the depth and fades the outline when disabled", () => {
    const el = bigAction("disabled").element;
    expect(css(el, "border-top-color")).toBe(rgb(tint.ink20));
    expect(css(el, "box-shadow")).toBe("none");
    expect((el as HTMLButtonElement).disabled).toBe(true);
  });

  it.each(["dont-tap", "act-now"] as const)(
    "outlines the Chalk label while %s with 2px of Ink plus the Ink shadow",
    (state) => {
      const label = labelOf(bigAction(state).element);
      expect(css(label, "-webkit-text-stroke-width")).toBe("2px");
      expect(css(label, "-webkit-text-stroke-color")).toBe(rgb(color.ink));
      expect(css(label, "text-shadow")).toBe(`${rgb(color.ink)} 0px 2px 0px`);
    },
  );

  it("fires press on pointerdown and release on pointerup, sinking in between", async () => {
    const wrapper = bigAction("hold");
    const el = wrapper.element as HTMLElement;
    el.style.transition = "none";
    const restTop = el.getBoundingClientRect().top;

    pointer(el, "pointerdown");
    await nextTick();
    expect(wrapper.emitted("press")).toHaveLength(1);
    expect(wrapper.emitted("release")).toBeUndefined();
    expect(el.getBoundingClientRect().top - restTop).toBe(4);
    expect(css(el, "box-shadow")).toBe(`${rgb(color.ink)} 0px 2px 0px 0px`);

    pointer(el, "pointerup");
    await nextTick();
    expect(wrapper.emitted("release")).toHaveLength(1);
    expect(el.getBoundingClientRect().top).toBe(restTop);
  });

  it("reports taps in every enabled state, so the game can call an early tap a foul", async () => {
    const wrapper = bigAction("dont-tap");
    await userEvent.click(wrapper.element);
    expect(wrapper.emitted("press")).toHaveLength(1);
    expect(wrapper.emitted("release")).toHaveLength(1);
  });

  it("ignores input when disabled", async () => {
    const wrapper = bigAction("disabled");
    pointer(wrapper.element, "pointerdown");
    wrapper.element.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    await nextTick();
    expect(wrapper.emitted("press")).toBeUndefined();
    expect(wrapper.element.classList).not.toContain("is-pressed");
  });

  it("releases a held press when it becomes disabled", async () => {
    const wrapper = bigAction("hold");
    pointer(wrapper.element, "pointerdown");
    await wrapper.setProps({ state: "disabled" });
    expect(wrapper.emitted("release")).toHaveLength(1);
    expect(wrapper.element.classList).not.toContain("is-pressed");
  });

  it("presses and releases with Space from the keyboard, exactly once", async () => {
    const wrapper = bigAction("act-now");
    (wrapper.element as HTMLButtonElement).focus();
    await userEvent.keyboard("{Space>}");
    expect(wrapper.emitted("press")).toHaveLength(1);
    expect(wrapper.element.classList).toContain("is-pressed");
    await userEvent.keyboard("{/Space}");
    expect(wrapper.emitted("press")).toHaveLength(1);
    expect(wrapper.emitted("release")).toHaveLength(1);
  });

  describe("accessibility", () => {
    it.each(["waiting", "dont-tap", "act-now", "hold"] as const)(
      "has no axe-core violations and passes the contrast check while %s",
      async (state) => {
        const el = bigAction(state).element;
        const results = await runAxe(el);
        expect(describeViolations(results)).toEqual([]);
        expect(contrastPassed(results, labelOf(el))).toBe(true);
      },
    );

    it("has no axe-core violations while disabled", async () => {
      // WCAG 1.4.3 sets no contrast requirement for disabled controls, so axe skips the Ink 45% label.
      expect(describeViolations(await runAxe(bigAction("disabled").element))).toEqual([]);
    });

    it("fails the contrast check on act-now without the Ink outline (control)", async () => {
      const label = labelOf(bigAction("act-now").element) as HTMLElement;
      label.style.setProperty("-webkit-text-stroke-width", "0px");
      label.style.textShadow = "none";
      const results = await runAxe(label);
      expect(results.violations.map((violation) => violation.id)).toContain("color-contrast");
    });
  });

  describe("reduced motion", () => {
    it("drops the press and state transitions when reduced motion is set", async () => {
      const el = bigAction("waiting").element;
      expect(css(el, "transition-duration")).toBe("0.08s, 0.08s, 0.08s");
      await commands.emulateReducedMotion(true);
      try {
        expect(css(el, "transition-duration")).toBe("0s");
      } finally {
        await commands.emulateReducedMotion(false);
      }
    });
  });
});
