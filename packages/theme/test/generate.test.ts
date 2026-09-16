import { describe, expect, it } from "vitest";
import { color, players, tint, tokens } from "@couchcade/theme";
import type { Tokens } from "@couchcade/theme";
import { cssVarEntries, toCssVars, toPhaserColor, toPhaserColors } from "@couchcade/theme/generate";

describe("toCssVars", () => {
  it("generates the :root stylesheet", () => {
    expect(toCssVars()).toMatchSnapshot();
  });

  it("uses the --cc- names from HOUSE_STYLE", () => {
    const vars = cssVarEntries();
    expect(vars["--cc-ink"]).toBe("#1E2A4A");
    expect(vars["--cc-ink-20"]).toBe(tint.ink20);
    expect(vars["--cc-ink-20-on-sky"]).toBe(tint.ink20OnSky);
    expect(vars["--cc-ink-45"]).toBe(tint.ink45);
    expect(vars["--cc-ink-70"]).toBe(tint.ink70);
    expect(vars["--cc-player-cherry"]).toBe(players[0].color);
    expect(vars["--cc-depth-rest"]).toBe("0 6px 0 var(--cc-ink)");
    expect(vars["--cc-motion-your-turn-duration"]).toBe("600ms");
    expect(toCssVars()).toMatch(/^:root \{\n {2}--cc-ink: #1E2A4A;\n/);
  });

  it("emits every colour token", () => {
    const values = Object.values(cssVarEntries());
    for (const hex of [...Object.values(color), ...Object.values(tint)]) {
      expect(values).toContain(hex);
    }
  });

  it("only emits valid CSS easings", () => {
    const vars = cssVarEntries();
    expect(vars["--cc-motion-ui-ease"]).toBe("cubic-bezier(.34,1.56,.64,1)");
    expect(vars).not.toHaveProperty("--cc-motion-celebrate-ease");
  });

  it("follows the tokens it is given, under any selector", () => {
    const custom: Tokens = {
      ...tokens,
      color: { ...tokens.color, ink: "#000000" },
    } as unknown as Tokens;
    expect(toCssVars(custom, ".preview")).toMatch(/^\.preview \{\n {2}--cc-ink: #000000;/);
  });
});

describe("toPhaserColor", () => {
  it("turns #RRGGBB into a number", () => {
    expect(toPhaserColor("#1E2A4A")).toBe(0x1e2a4a);
    expect(toPhaserColor("#ffc83d")).toBe(0xffc83d);
  });

  it.each(["#FFF", "1E2A4A", "#1E2A4AFF", "#GGGGGG"])("rejects %s, which isn't #RRGGBB", (bad) => {
    expect(() => toPhaserColor(bad as `#${string}`)).toThrow(TypeError);
  });

  it("generates every named colour for Phaser", () => {
    const phaser = toPhaserColors();
    const readable = Object.fromEntries(
      Object.entries(phaser).map(([group, values]) => [
        group,
        Object.fromEntries(
          Object.entries(values).map(([name, value]) => [
            name,
            `0x${value.toString(16).toUpperCase().padStart(6, "0")}`,
          ]),
        ),
      ]),
    );
    expect(readable).toMatchSnapshot();
    expect(phaser.color.ink).toBe(0x1e2a4a);
    expect(phaser.tint.ink20OnSky).toBe(0x78b1d2);
    expect(phaser.players.teal).toBe(0x1fb5b0);
  });
});
