import { color, players } from "@couchcade/theme";
import { describe, expect, it } from "vitest";
import { h } from "vue";
import { CcPanel, CcPlayerChip, CcPlayerShape } from "../../src/components/index.ts";
import { css, describeViolations, mountIn, rgb, runAxe } from "./helpers.ts";

describe("CcPanel", () => {
  it("is a Chalk panel with the outline, panel radius and panel depth", () => {
    const el = mountIn(CcPanel, { slots: { default: () => "Sam picks what's next" } }).element;
    expect(css(el, "background-color")).toBe(rgb(color.chalk));
    expect(css(el, "border-top-width")).toBe("3px");
    expect(css(el, "border-top-color")).toBe(rgb(color.ink));
    expect(css(el, "border-top-left-radius")).toBe("20px");
    expect(css(el, "box-shadow")).toBe(`${rgb(color.ink)} 0px 6px 0px 0px`);
    expect(el.querySelector(".cc-panel__tab")).toBeNull();
  });

  it("carries a Sky tab overlapping its top edge", () => {
    const panel = mountIn(CcPanel, {
      props: { tab: "Join a game", as: "section" },
      slots: { default: () => "Type the code on the TV" },
    }).element;
    const tab = panel.querySelector(".cc-panel__tab") as HTMLElement;
    expect(tab.textContent).toBe("Join a game");
    expect(css(tab, "background-color")).toBe(rgb(color.sky));
    expect(css(tab, "border-top-left-radius")).toBe("10px");
    const tabBox = tab.getBoundingClientRect();
    const panelTop = panel.getBoundingClientRect().top;
    expect(tabBox.top).toBeLessThan(panelTop);
    expect(tabBox.bottom).toBeGreaterThan(panelTop);
    expect(panel.getAttribute("aria-labelledby")).toBe(tab.id);
  });

  it("uses the 4px outline on the TV", () => {
    const el = mountIn(CcPanel, { props: { screen: "tv" } }, 1200).element;
    expect(css(el, "border-top-width")).toBe("4px");
  });

  it("has no axe-core violations", async () => {
    const el = mountIn(CcPanel, {
      props: { tab: "Players 5/8", as: "section" },
      slots: { default: () => h("p", "Sam starts the game from their phone") },
    }).element;
    expect(describeViolations(await runAxe(el))).toEqual([]);
  });
});

describe("CcPlayerChip", () => {
  it.each(players.map((player) => [player.id, player.shape, player.color] as const))(
    "shows %s with the %s shape in their colour",
    (id, _shape, hex) => {
      const el = mountIn(CcPlayerChip, { props: { player: id, name: "Sam" } }).element;
      const svg = el.querySelector("svg.cc-player-shape") as SVGElement;
      const mark = svg.firstElementChild as SVGElement;
      expect(css(mark, "fill")).toBe(rgb(hex));
      expect(css(mark, "stroke")).toBe(rgb(color.ink));
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.getAttribute("viewBox")).toBe("-2 -2 28 28");
    },
  );

  it("gives all eight players a different mark", () => {
    const geometry = players.map(({ id }) => {
      const mark = mountIn(CcPlayerShape, { props: { player: id } }).element
        .firstElementChild as SVGElement;
      const attributes = ["d", "r", "width"].map((name) => mark.getAttribute(name));
      return [mark.tagName, ...attributes].join(" ");
    });
    expect(new Set(geometry).size).toBe(8);
  });

  it("is a Chalk pill with the name in Fredoka and the score in Pixelify Sans", () => {
    const el = mountIn(CcPlayerChip, {
      props: { player: "ocean", name: "Noor", score: 12 },
    }).element;
    expect(css(el, "background-color")).toBe(rgb(color.chalk));
    expect(css(el, "border-top-left-radius")).toBe("999px");
    const name = el.querySelector(".cc-player-chip__name") as HTMLElement;
    const score = el.querySelector(".cc-player-chip__score") as HTMLElement;
    expect(name.textContent).toBe("Noor");
    expect(css(name, "font-family")).toMatch(/^"?Fredoka/);
    expect(score.textContent).toBe("12");
    expect(css(score, "font-family")).toMatch(/^"?Pixelify Sans/);
    // Shape on the left, score on the right.
    const shape = el.querySelector("svg") as SVGElement;
    expect(shape.getBoundingClientRect().left).toBeLessThan(name.getBoundingClientRect().left);
    expect(score.getBoundingClientRect().left).toBeGreaterThan(name.getBoundingClientRect().right);
  });

  it("leaves the score out when there is none, and puts an avatar before the shape", () => {
    const el = mountIn(CcPlayerChip, {
      props: { player: "grape", name: "Lotte" },
      slots: { avatar: () => h("span", { class: "pip-head" }) },
    }).element;
    expect(el.querySelector(".cc-player-chip__score")).toBeNull();
    expect(el.firstElementChild?.classList).toContain("pip-head");
  });

  it("draws a plain Sky circle for an audience member", () => {
    const el = mountIn(CcPlayerChip, { props: { name: "Mees" } }).element;
    const mark = el.querySelector("svg circle") as SVGElement;
    expect(css(mark, "fill")).toBe(rgb(color.sky));
  });

  it("keeps the outline weight when the shape is scaled", () => {
    const phone = mountIn(CcPlayerShape, { props: { player: "teal", size: 56 } }).element;
    expect(Number(phone.firstElementChild?.getAttribute("stroke-width"))).toBeCloseTo(1.5);
    const tv = mountIn(CcPlayerShape, {
      props: { player: "teal", size: 32, screen: "tv" },
    }).element;
    expect(Number(tv.firstElementChild?.getAttribute("stroke-width"))).toBeCloseTo(3.5);
  });

  it.each(["phone", "tv"] as const)("has no axe-core violations on the %s", async (screen) => {
    const el = mountIn(
      CcPlayerChip,
      { props: { player: "cherry", name: "Sam", score: 9, screen } },
      screen === "tv" ? 1200 : 390,
    ).element;
    expect(describeViolations(await runAxe(el))).toEqual([]);
  });
});
