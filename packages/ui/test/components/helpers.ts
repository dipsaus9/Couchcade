import { mount } from "@vue/test-utils";
import axe from "axe-core";
import type { AxeResults } from "axe-core";
import { afterEach } from "vitest";
import type { Component } from "vue";

const mounted: { unmount: () => void }[] = [];
const hosts: HTMLElement[] = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  for (const host of hosts.splice(0)) host.remove();
});

/** Mounts a component into the page, inside a phone-wide (390px) or TV-wide Chalk frame. */
export function mountIn<C extends Component>(
  component: C,
  options: Parameters<typeof mount<C>>[1] = {},
  width = 390,
) {
  const host = document.createElement("main");
  host.style.cssText = `width:${width}px;padding:24px;box-sizing:border-box;background:var(--cc-chalk)`;
  document.body.append(host);
  hosts.push(host);
  const wrapper = mount(component, { ...options, attachTo: host });
  mounted.push(wrapper);
  return wrapper;
}

/** `#1E2A4A` as the `rgb(30, 42, 74)` a computed style reports. */
export function rgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

export function css(element: Element, property: string): string {
  return getComputedStyle(element).getPropertyValue(property);
}

/** Runs every axe-core rule on the element. */
export function runAxe(element: Element): Promise<AxeResults> {
  return axe.run(element);
}

/** A readable summary of violations, so a failing test shows what axe found. */
export function describeViolations(results: AxeResults): string[] {
  return results.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.failureSummary ?? ""}`),
  );
}

/** Whether axe ran the colour contrast check on `element` and it passed. */
export function contrastPassed(results: AxeResults, element: Element): boolean {
  const rule = results.passes.find((pass) => pass.id === "color-contrast");
  return Boolean(
    rule?.nodes.some((node) => document.querySelector(String(node.target[0])) === element),
  );
}

export function pointer(element: Element, type: string, init: PointerEventInit = {}): void {
  element.dispatchEvent(
    new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, ...init }),
  );
}
