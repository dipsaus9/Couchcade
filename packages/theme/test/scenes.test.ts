import { describe, expect, it } from "vitest";
import { color, world } from "@couchcade/theme";
import type { ScenePalette } from "@couchcade/theme";
import {
  getScenePalette,
  registerScenePalettes,
  scenePalettes,
  scenes,
} from "@couchcade/theme/scenes";
import { documentedTokens } from "./house-style.ts";

describe("scene palettes", () => {
  it("register desert, alley and track from their game files", () => {
    expect(scenePalettes.map(({ id, game }) => ({ id, game }))).toEqual(
      expect.arrayContaining([
        { id: "desert", game: "quick-draw" },
        { id: "alley", game: "strike-night" },
        { id: "track", game: "pixel-derby" },
      ]),
    );
  });

  it("match the scene palettes in HOUSE_STYLE", () => {
    expect(scenes).toMatchObject(documentedTokens().scenes as object);
  });

  it("stay within the world colour cap with the core palette", () => {
    for (const palette of scenePalettes) {
      expect(palette.world.length).toBeLessThanOrEqual(world.maxColors);
      expect(palette.world).toEqual(expect.arrayContaining(Object.values(color)));
      expect(new Set(palette.world).size).toBe(palette.world.length);
    }
    expect(getScenePalette("desert").world).toHaveLength(8);
  });

  it("find a palette by id and reject unknown ids", () => {
    expect(getScenePalette("alley").game).toBe("strike-night");
    expect(() => getScenePalette("moon")).toThrow(RangeError);
  });
});

const palette = (id: string, colors: string[]): ScenePalette => ({ id, colors }) as ScenePalette;

describe("registerScenePalettes", () => {
  it("names each palette after its file", () => {
    const [registered] = registerScenePalettes({ "./new-game.ts": palette("beach", ["#123456"]) });
    expect(registered).toMatchObject({ id: "beach", game: "new-game" });
  });

  it("rejects a duplicate scene id", () => {
    expect(() =>
      registerScenePalettes({
        "./one.ts": palette("beach", []),
        "./two.ts": palette("beach", []),
      }),
    ).toThrow(/used by both one and two/);
  });

  it("rejects more than 16 colours with core", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `#0000${String(i).padStart(2, "0")}`);
    expect(() => registerScenePalettes({ "./big.ts": palette("big", eleven) })).toThrow(RangeError);
    expect(() =>
      registerScenePalettes({ "./ok.ts": palette("ok", eleven.slice(1)) }),
    ).not.toThrow();
  });

  it("rejects a colour that isn't upper-case #RRGGBB", () => {
    expect(() => registerScenePalettes({ "./bad.ts": palette("bad", ["#abc"]) })).toThrow(
      TypeError,
    );
  });
});
