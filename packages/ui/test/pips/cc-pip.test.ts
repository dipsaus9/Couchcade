import { color, pipHairstyleIds, players } from "@couchcade/theme";
import { describe, expect, it } from "vitest";
import { CcPip } from "../../src/pips/index.ts";
import { css, describeViolations, mountIn, rgb, runAxe } from "../components/helpers.ts";

// hairColour 0 (Navy) is used deliberately: none of the eight player colours are Navy, so the
// audience test below can tell "this fill is the jersey/hair" apart from "this fill is a player
// colour" without a coincidental hex collision (hairColour 4 is Red, the same hex as `cherry`).
const profile = { skin: 3, hair: 0, hairColour: 0 };

function pip(props: { slot: number | null } & Record<string, unknown>, width = 390) {
  return mountIn(CcPip, { props: { profile, size: 150, ...props } }, width).element as SVGElement;
}

describe("CcPip", () => {
  it("renders every part: hair, jersey, head and face", () => {
    const el = pip({ slot: 0 });
    // hair-back(0) or hair-front(1) + jersey + jersey-neck + chest-shape + head [+ hair] + 2 eyes + mouth.
    expect(el.children.length).toBeGreaterThanOrEqual(6);
  });

  it.each(players.map((player, slot) => [slot, player.id, player.color] as const))(
    "paints the jersey in slot %s's player colour (%s)",
    (slot, _id, hex) => {
      const el = pip({ slot });
      // The jersey path is found by its fill instead of position, since some hairstyles add a
      // back layer before it.
      const jersey = Array.from(el.children).find((node) => css(node, "fill") === rgb(hex));
      expect(jersey).toBeTruthy();
      // The chest shape mark is a plain Chalk fill, distinct from the jersey's player colour.
      const chest = Array.from(el.children).find(
        (node) => css(node, "fill") === rgb(color.chalk) && node !== jersey,
      );
      expect(chest).toBeTruthy();
    },
  );

  it("draws a plain Chalk jersey with no emblem for an audience Pip (slot null)", () => {
    const el = pip({ slot: null });
    const chalkFills = Array.from(el.children).filter(
      (node) => css(node, "fill") === rgb(color.chalk),
    );
    // Only the head's hair (if any) or face parts could also resolve to chalk incidentally; the
    // jersey itself must be chalk, and there is no separate chest-shape mark.
    expect(chalkFills.length).toBeGreaterThan(0);
    for (const hex of players.map((player) => player.color)) {
      expect(Array.from(el.children).some((node) => css(node, "fill") === rgb(hex))).toBe(false);
    }
  });

  it.each(pipHairstyleIds.map((id, hair) => [hair, id] as const))(
    "renders hairstyle %s (%s) without throwing",
    (hair) => {
      expect(() => pip({ slot: 1, profile: { ...profile, hair } })).not.toThrow();
    },
  );

  it("gives bald no hair layer beyond the head and face", () => {
    const withHair = pip({ slot: 1, profile: { ...profile, hair: 0 } });
    const bald = pip({ slot: 1, profile: { ...profile, hair: pipHairstyleIds.indexOf("bald") } });
    expect(bald.children.length).toBeLessThan(withHair.children.length);
  });

  it("uses the head crop viewBox and keeps only the head visible", () => {
    const el = pip({ slot: 2, crop: "head" });
    expect(el.getAttribute("viewBox")).toBe("6 4 88 88");
  });

  it("keeps the outline exactly 4px on the TV and 3px on a phone at any size", () => {
    const phone = pip({ slot: 3, size: 56 });
    const tv = pip({ slot: 3, size: 56, surface: "tv" });
    const phoneHead = phone.querySelector("circle") as SVGCircleElement;
    const tvHead = tv.querySelector("circle") as SVGCircleElement;
    expect(Number(phoneHead.getAttribute("stroke-width"))).toBeCloseTo((3 * 100) / 56);
    expect(Number(tvHead.getAttribute("stroke-width"))).toBeCloseTo((4 * 100) / 56);
  });

  it("wraps an out-of-range profile index instead of throwing", () => {
    expect(() => pip({ slot: 0, profile: { skin: 99, hair: -3, hairColour: 12 } })).not.toThrow();
  });

  it("is role=img with the label when given one, and aria-hidden without one", () => {
    const labelled = pip({ slot: 0, label: "Noor's Pip" });
    expect(labelled.getAttribute("role")).toBe("img");
    expect(labelled.getAttribute("aria-label")).toBe("Noor's Pip");
    const unlabelled = pip({ slot: 0 });
    expect(unlabelled.getAttribute("aria-hidden")).toBe("true");
    expect(unlabelled.getAttribute("role")).toBeNull();
  });

  it.each(["neutral", "happy", "surprised", "sad"] as const)(
    "renders the %s expression without throwing",
    (expression) => {
      expect(() => pip({ slot: 4, expression })).not.toThrow();
    },
  );

  it("has no axe-core violations", async () => {
    const el = pip({ slot: 5, label: "Sam's Pip" });
    expect(describeViolations(await runAxe(el))).toEqual([]);
  });
});
