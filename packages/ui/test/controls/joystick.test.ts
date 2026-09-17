import { color } from "@couchcade/theme";
import { describe, expect, it } from "vitest";
import { CcJoystick } from "../../src/controls/index.ts";
import { css, describeViolations, mountIn, rgb, runAxe } from "../components/helpers.ts";

/**
 * nipplejs binds `pointerdown` to the zone element itself, but `pointermove` and `pointerup` to
 * `document` (so a drag that leaves the zone is still tracked).
 */
function dispatch(zone: Element, type: string, init: PointerEventInit): void {
  const target = type === "pointerdown" ? zone : document;
  target.dispatchEvent(
    new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, ...init }),
  );
}

function center(el: Element): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("CcJoystick", () => {
  it("draws a Chalk-and-Ink base with a Sunny thumb, and touch-action: manipulation", () => {
    const el = mountIn(CcJoystick, { props: { size: 160 } }).element;
    expect(css(el, "touch-action")).toBe("manipulation");
    const base = el.querySelector(".cc-joystick__base") as HTMLElement;
    const thumb = el.querySelector(".cc-joystick__thumb") as HTMLElement;
    expect(css(base, "background-color")).toBe(rgb(color.chalk));
    expect(css(base, "border-top-color")).toBe(rgb(color.ink));
    expect(css(thumb, "background-color")).toBe(rgb(color.sunny));
  });

  it("emits a normalised vector while dragging, x positive to the right", async () => {
    const wrapper = mountIn(CcJoystick, { props: { size: 160 } });
    const el = wrapper.element;
    const mid = center(el);

    dispatch(el, "pointerdown", { clientX: mid.x, clientY: mid.y });
    dispatch(el, "pointermove", { clientX: mid.x + 40, clientY: mid.y });
    await settle();

    const moves = wrapper.emitted<[{ x: number; y: number }]>("move") ?? [];
    expect(moves.length).toBeGreaterThan(0);
    const last = moves.at(-1)?.[0];
    expect(last?.x).toBeCloseTo(0.5, 1);
    expect(last?.y).toBeCloseTo(0, 1);

    dispatch(el, "pointerup", { clientX: mid.x + 40, clientY: mid.y });
    await settle();
    expect(wrapper.emitted<[{ x: number; y: number }]>("move")?.at(-1)?.[0]).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("reports y positive when dragging up the screen, towards the TV", async () => {
    const wrapper = mountIn(CcJoystick, { props: { size: 160 } });
    const el = wrapper.element;
    const mid = center(el);

    dispatch(el, "pointerdown", { clientX: mid.x, clientY: mid.y });
    dispatch(el, "pointermove", { clientX: mid.x, clientY: mid.y - 40 });
    await settle();

    const last = wrapper.emitted<[{ x: number; y: number }]>("move")?.at(-1)?.[0];
    expect(last?.x).toBeCloseTo(0, 1);
    expect(last?.y).toBeCloseTo(0.5, 1);

    dispatch(el, "pointerup", { clientX: mid.x, clientY: mid.y - 40 });
  });

  it("toggles the active fill while held", async () => {
    const wrapper = mountIn(CcJoystick, { props: { size: 160 } });
    const el = wrapper.element;
    const mid = center(el);

    dispatch(el, "pointerdown", { clientX: mid.x, clientY: mid.y });
    await settle();
    expect(el.classList).toContain("is-active");

    dispatch(el, "pointerup", { clientX: mid.x, clientY: mid.y });
    await settle();
    expect(el.classList).not.toContain("is-active");
  });

  it("has no axe-core violations", async () => {
    const el = mountIn(CcJoystick, { props: { label: "Steer" } }).element;
    expect(describeViolations(await runAxe(el))).toEqual([]);
  });
});
