import { describe, expect, it } from "vitest";
import {
  color,
  font,
  motion,
  pip,
  players,
  shape,
  textPairs,
  tint,
  tokens,
  typeScale,
  world,
} from "@couchcade/theme";
import type { TextPair } from "@couchcade/theme";
import { documentedTokens, houseStyle } from "./house-style.ts";

const HEX = /#[0-9A-F]{6}/g;

describe("tokens match docs/HOUSE_STYLE.md", () => {
  const documented = documentedTokens();

  it("export the documented tokens.ts constants with the same values", () => {
    expect(color).toEqual(documented.color);
    expect(players).toEqual(documented.players);
    expect(font).toEqual(documented.font);
    expect(motion).toEqual(documented.motion);
    expect(world).toEqual(documented.world);
    expect(shape).toMatchObject(documented.shape as object);
  });

  it("use every hex colour in the document, and no undocumented one outside the tints", () => {
    const inDoc = new Set(houseStyle.match(HEX));
    const inTokens = new Set(
      [
        ...Object.values(color),
        ...players.map((player) => player.color),
        ...pip.skin,
        ...pip.hair,
        ...Object.values(documented.scenes as Record<string, string[]>).flat(),
      ].map((hex) => hex.toUpperCase()),
    );
    expect([...inTokens].toSorted()).toEqual([...inDoc].toSorted());
  });

  it("carry the core colour and player tables", () => {
    for (const [name, hex] of Object.entries(color)) {
      expect(houseStyle).toMatch(new RegExp(`\\| \\*\\*${name}\\*\\* \\| \`${hex}\``, "i"));
    }
    players.forEach((player, i) => {
      expect(houseStyle).toMatch(new RegExp(`\\| ${i + 1} \\| \\w+ \\| \`${player.color}\``));
    });
  });

  it("carry the Pip skin and hair tones in order", () => {
    const row = /\| Skin tones \| Hair colours \|\n\|[-|]+\|\n\| (.*) \| (.*) \|/.exec(houseStyle);
    expect(row?.[1]?.match(HEX)).toEqual(pip.skin);
    expect(row?.[2]?.match(HEX)).toEqual(pip.hair);
  });

  it("carry the type scale", () => {
    const families = { ui: "Fredoka", pixel: "Pixelify" } as const;
    for (const [name, role] of Object.entries(typeScale)) {
      const phone =
        role.phone === null ? "n/a" : `${role.phone}px ${families[role.font]} ${role.weight}`;
      const tv = `${role.tv}px ${families[role.font]} ${role.weight}`;
      expect(houseStyle).toContain(`| \`${name}\` | ${tv} | ${phone} |`);
    }
  });

  it("carry the shape table values", () => {
    expect(houseStyle).toContain(`| \`depth-rest\` | \`0 ${shape.depth.rest}px 0 Ink\``);
    expect(houseStyle).toContain(
      `| \`depth-pressed\` | \`0 ${shape.depth.pressed}px 0 Ink\`, element moves down ${shape.depth.pressOffset}px`,
    );
    expect(houseStyle).toContain(`| \`depth-panel\` | \`0 ${shape.depth.panel}px 0 Ink\``);
    expect(houseStyle).toContain(`${shape.safeTv * 100}% of the screen on every side`);
    expect(houseStyle).toContain(
      `Sunny ${shape.focusRing.width}px focus ring with ${shape.focusRing.offset}px offset`,
    );
  });
});

describe("owner-approved additions (docs/design/platform-screens.md, 2026-09-16)", () => {
  it("add the ink-20, ink-45 and ink-70 tints", () => {
    expect(tint).toEqual({
      ink20: "#CED2DB",
      ink20OnSky: "#78B1D2",
      ink45: "#979EAE",
      ink70: "#60697F",
    });
  });

  it("add the 64px small TV button", () => {
    expect(shape.tvButtonSmall).toBe(64);
  });

  it("keep ink-45 to disabled text", () => {
    const pairs: readonly TextPair[] = textPairs;
    const uses = pairs.filter((pair) => pair.text === "ink45" || pair.background === "ink45");
    expect(uses.length).toBeGreaterThan(0);
    expect(uses.every((pair) => pair.disabled === true)).toBe(true);
  });
});

describe("token object", () => {
  it("collects every token group for the generators", () => {
    expect(Object.keys(tokens).toSorted()).toEqual([
      "color",
      "font",
      "motion",
      "pip",
      "players",
      "shape",
      "textPairs",
      "tint",
      "typeScale",
      "world",
    ]);
  });

  it("writes every colour as upper-case #RRGGBB", () => {
    const all = [
      ...Object.values(color),
      ...Object.values(tint),
      ...players.map((player) => player.color),
      ...pip.skin,
      ...pip.hair,
    ];
    for (const hex of all) expect(hex).toMatch(/^#[0-9A-F]{6}$/);
  });
});
