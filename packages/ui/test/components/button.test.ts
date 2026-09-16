import { color, tint } from "@couchcade/theme";
import { describe, expect, it } from "vitest";
import { commands, userEvent } from "vitest/browser";
import { nextTick } from "vue";
import { CcButton } from "../../src/components/index.ts";
import type { ButtonVariant, Screen } from "../../src/components/index.ts";
import {
  contrastPassed,
  css,
  describeViolations,
  mountIn,
  pointer,
  rgb,
  runAxe,
} from "./helpers.ts";

const fills: Record<ButtonVariant, string> = {
  primary: color.sunny,
  go: color.turf,
  stop: color.signal,
  quiet: color.chalk,
};
const labels: Record<ButtonVariant, string> = {
  primary: "Start game",
  go: "Ready",
  stop: "Leave room",
  quiet: "How to play",
};
const variants = Object.keys(fills) as ButtonVariant[];

function button(props: Record<string, unknown> = {}, label = "Start game") {
  return mountIn(
    CcButton,
    { props, slots: { default: () => label } },
    props.screen === "tv" ? 1200 : 390,
  );
}

describe("CcButton", () => {
  it.each(variants)("draws %s with its house style fill, outline and depth", (variant) => {
    const el = button({ variant }, labels[variant]).element;
    expect(css(el, "background-color")).toBe(rgb(fills[variant]));
    expect(css(el, "border-top-color")).toBe(rgb(color.ink));
    expect(css(el, "border-top-width")).toBe("3px");
    expect(css(el, "border-top-left-radius")).toBe("999px");
    expect(css(el, "box-shadow")).toBe(`${rgb(color.ink)} 0px 6px 0px 0px`);
    expect(css(el, "color")).toBe(
      rgb(variant === "go" || variant === "stop" ? color.chalk : color.ink),
    );
  });

  it.each(variants)("makes %s at least 56px tall on the phone", (variant) => {
    const el = button({ variant }, labels[variant]).element;
    expect(el.getBoundingClientRect().height).toBeGreaterThanOrEqual(56);
  });

  it("uses the TV sizes, with the 64px small button for Kick", () => {
    const tv = button({ variant: "quiet", screen: "tv" }).element;
    expect(tv.getBoundingClientRect().height).toBe(88);
    expect(css(tv, "border-top-width")).toBe("4px");
    const kick = button({ variant: "stop", screen: "tv", small: true }, "Kick").element;
    expect(kick.getBoundingClientRect().height).toBe(64);
  });

  it.each(variants)("sinks %s while a pointer is down", async (variant) => {
    const wrapper = button({ variant }, labels[variant]);
    const el = wrapper.element as HTMLButtonElement;
    const restTop = el.getBoundingClientRect().top;
    // No transition, so the sunk position is measurable straight away.
    el.style.transition = "none";

    pointer(el, "pointerdown");
    await nextTick();
    expect(el.classList).toContain("is-pressed");
    expect(css(el, "box-shadow")).toBe(`${rgb(color.ink)} 0px 2px 0px 0px`);
    expect(el.getBoundingClientRect().top - restTop).toBe(4);

    pointer(el, "pointerup");
    await nextTick();
    expect(el.classList).not.toContain("is-pressed");
    expect(el.getBoundingClientRect().top).toBe(restTop);
  });

  it("fires press on click by default, not on pointerdown", async () => {
    const wrapper = button({ variant: "primary" });
    pointer(wrapper.element, "pointerdown");
    expect(wrapper.emitted("press")).toBeUndefined();
    await userEvent.click(wrapper.element);
    expect(wrapper.emitted("press")).toHaveLength(1);
  });

  it("fires press once on pointerdown in gameplay mode, and still works from the keyboard", async () => {
    const wrapper = button({ variant: "go", trigger: "pointerdown" }, "Throw");
    // A real click sends pointerdown, pointerup, then click: only the pointerdown counts.
    await userEvent.click(wrapper.element);
    expect(wrapper.emitted("press")).toHaveLength(1);
    const [first] = wrapper.emitted<[Event]>("press") ?? [];
    expect(first?.[0].type).toBe("pointerdown");

    (wrapper.element as HTMLButtonElement).focus();
    await userEvent.keyboard("{Enter}");
    expect(wrapper.emitted("press")).toHaveLength(2);
  });

  it("ignores presses and drops its depth when disabled", async () => {
    const wrapper = button({ variant: "go", disabled: true, trigger: "pointerdown" }, "Ready");
    const el = wrapper.element;
    pointer(el, "pointerdown");
    await nextTick();
    expect(el.classList).not.toContain("is-pressed");
    expect(wrapper.emitted("press")).toBeUndefined();
    expect(css(el, "background-color")).toBe(rgb(color.chalk));
    expect(css(el, "border-top-color")).toBe(rgb(tint.ink20));
    expect(css(el, "color")).toBe(rgb(tint.ink45));
    expect(css(el, "box-shadow")).toBe("none");
  });

  it.each<[ButtonVariant, Screen, string]>([
    ["go", "phone", "2px"],
    ["stop", "phone", "2px"],
    ["go", "tv", "3px"],
    ["stop", "tv", "3px"],
  ])(
    "outlines the Chalk label on %s (%s) with %s of Ink plus the Ink shadow",
    (variant, screen, width) => {
      const el = button({ variant, screen }, labels[variant]).element;
      expect(css(el, "-webkit-text-stroke-width")).toBe(width);
      expect(css(el, "-webkit-text-stroke-color")).toBe(rgb(color.ink));
      expect(css(el, "text-shadow")).toBe(`${rgb(color.ink)} 0px ${width} 0px`);
    },
  );

  it.each(["primary", "quiet"] as const)("keeps the plain Ink label on %s", (variant) => {
    const el = button({ variant }, labels[variant]).element;
    expect(css(el, "-webkit-text-stroke-width")).toBe("0px");
    expect(css(el, "text-shadow")).toBe("none");
  });

  describe("accessibility", () => {
    it.each<[ButtonVariant, Screen]>(
      variants.flatMap((variant) => [
        [variant, "phone"],
        [variant, "tv"],
      ]),
    )("has no axe-core violations: %s on %s", async (variant, screen) => {
      const el = button({ variant, screen }, labels[variant]).element;
      const results = await runAxe(el);
      expect(describeViolations(results)).toEqual([]);
      expect(contrastPassed(results, el)).toBe(true);
    });

    it("has no axe-core violations when disabled", async () => {
      const el = button({ variant: "stop", disabled: true }, "Leave room").element;
      expect(describeViolations(await runAxe(el))).toEqual([]);
    });

    it.each(["go", "stop"] as const)(
      "fails the contrast check on %s without the Ink outline (control)",
      async (variant) => {
        // Chalk on Turf is 2.6:1. Chalk on Signal is 3.4:1, which only fails at normal text size.
        const el = button({ variant }, labels[variant]).element as HTMLElement;
        el.style.setProperty("-webkit-text-stroke-width", "0px");
        el.style.textShadow = "none";
        if (variant === "stop") el.style.fontSize = "16px";
        const results = await runAxe(el);
        expect(results.violations.map((violation) => violation.id)).toContain("color-contrast");
      },
    );
  });

  describe("reduced motion", () => {
    it("animates the press, and drops the transition when reduced motion is set", async () => {
      const el = button({ variant: "primary" }).element;
      expect(css(el, "transition-duration")).toBe("0.08s, 0.08s");
      await commands.emulateReducedMotion(true);
      try {
        expect(css(el, "transition-duration")).toBe("0s");
      } finally {
        await commands.emulateReducedMotion(false);
      }
    });
  });
});
