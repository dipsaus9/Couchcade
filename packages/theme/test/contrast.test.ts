import { describe, expect, it } from "vitest";
import { color, textPairs, tint } from "@couchcade/theme";
import type { ColorName, Hex, TextPair } from "@couchcade/theme";
import { AA_LARGE, AA_TEXT, contrastRatio, mix } from "./wcag.ts";

const hex = (name: ColorName): Hex => ({ ...color, ...tint })[name];
const label = (pair: TextPair): string =>
  `${pair.text} on ${pair.background}${pair.halo ? ` with ${pair.halo} halo` : ""}`;

const pairs: readonly TextPair[] = textPairs;
const checked = pairs.filter((pair) => !pair.disabled);

describe("contrast helper", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    // #767676 is the lightest grey that passes AA on white.
    expect(contrastRatio("#767676", "#FFFFFF")).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeLessThan(AA_TEXT);
  });
});

describe("text pairs pass WCAG AA", () => {
  it("declares every pair once, with known colours", () => {
    expect(new Set(pairs.map(label)).size).toBe(pairs.length);
    for (const pair of pairs) {
      const names = [pair.text, pair.background, ...(pair.halo ? [pair.halo] : [])];
      for (const name of names) expect(hex(name)).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it.each(checked.map((pair) => [label(pair), pair] as const))(
    "%s reaches 4.5:1 between the text and what sits directly behind it",
    (_, pair) => {
      // WCAG 1.4.3: an outline wide enough to fill the letter's inner details is the background.
      const behind = pair.halo ?? pair.background;
      expect(contrastRatio(hex(pair.text), hex(behind))).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );

  it.each(checked.filter((pair) => pair.halo).map((pair) => [label(pair), pair] as const))(
    "%s keeps the halo edge at 3:1 against the background",
    (_, pair) => {
      // Read as a narrow border instead, the halo is part of the letter, so its edge must stand out
      // from the background: 3:1, as for large text (haloed text is `action` size or larger) and
      // for graphical objects under WCAG 1.4.11.
      expect(contrastRatio(hex(pair.halo!), hex(pair.background))).toBeGreaterThanOrEqual(AA_LARGE);
    },
  );

  it("exempts ink-45 only, because it is for disabled controls", () => {
    // WCAG 1.4.3 "Incidental": text in an inactive user interface component has no contrast
    // requirement. The owner approved ink-45 on 2026-09-16 for disabled labels only, so it is
    // the one exempt pair. Any other disabled pair needs the same review first.
    const exempt = pairs.filter((pair) => pair.disabled);
    expect(exempt.map(label)).toEqual(["ink45 on chalk"]);
    // It would fail as normal text, which is why it must never be used for enabled text.
    expect(contrastRatio(tint.ink45, color.chalk)).toBeLessThan(AA_TEXT);
  });
});

// The approved values round one channel differently (ink-70 blue is 7F, exact 80), so allow 1.
const channelDistance = (a: Hex, b: Hex): number =>
  Math.max(
    ...[1, 3, 5].map((i) =>
      Math.abs(Number.parseInt(a.slice(i, i + 2), 16) - Number.parseInt(b.slice(i, i + 2), 16)),
    ),
  );

describe("ink tints", () => {
  it("are Ink mixed solid into the fill they sit on, within one step per channel", () => {
    expect(channelDistance(mix(color.ink, color.chalk, 0.2), tint.ink20)).toBeLessThanOrEqual(1);
    expect(channelDistance(mix(color.ink, color.sky, 0.2), tint.ink20OnSky)).toBeLessThanOrEqual(1);
    expect(channelDistance(mix(color.ink, color.chalk, 0.45), tint.ink45)).toBeLessThanOrEqual(1);
    expect(channelDistance(mix(color.ink, color.chalk, 0.7), tint.ink70)).toBeLessThanOrEqual(1);
  });
});
