import { describe, expect, it } from "vitest";
import { color, pip, players } from "@couchcade/theme";
import { worldPip, worldPipKey, worldPipLook, worldPipSize } from "../../src/host/world-pip.ts";

const look = worldPipLook(1, { skin: 2, hairColour: 4 });
const neutral = { expression: "neutral", blink: false } as const;

const colours = (grid: ReturnType<typeof worldPip>) => new Set(grid.flat().filter(Boolean));

describe("World Pip placeholder", () => {
  it("takes the jersey and shape from the seat and skin and hair from the profile", () => {
    expect(look).toEqual({
      jersey: players[1].color,
      shape: players[1].shape,
      skin: pip.skin[2],
      hair: pip.hair[4],
    });
    // Slots and profile indexes wrap, so a bad value never throws mid-match.
    expect(worldPipLook(9, { skin: -1, hairColour: 6 })).toEqual({
      jersey: players[1].color,
      shape: players[1].shape,
      skin: pip.skin[5],
      hair: pip.hair[0],
    });
    expect(worldPipLook(0, undefined).skin).toBe(pip.skin[0]);
  });

  it("is a 16×24 sprite in the look's colours with a 1px Ink outline", () => {
    const grid = worldPip(look, neutral);
    expect(grid).toHaveLength(worldPipSize.height);
    for (const row of grid) expect(row).toHaveLength(worldPipSize.width);
    expect(colours(grid)).toEqual(
      new Set([color.ink, color.chalk, look.jersey, look.skin, look.hair]),
    );

    // Every filled pixel on the sprite's edge is Ink, and so is every pixel next to transparency.
    grid.forEach((row, y) =>
      row.forEach((pixel, x) => {
        if (pixel === null || pixel === color.ink) return;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          expect(grid[y + dy]?.[x + dx] ?? null).not.toBeNull();
        }
      }),
    );
  });

  it("changes only the face for each expression and a blink", () => {
    const faces = [
      neutral,
      { expression: "happy", blink: false },
      { expression: "surprised", blink: false },
      { expression: "neutral", blink: true },
    ] as const;
    const grids = faces.map((face) => worldPip(look, face));
    const keys = faces.map((face) => worldPipKey(look, face));
    expect(new Set(keys).size).toBe(faces.length);
    for (const grid of grids.slice(1)) {
      expect(grid).not.toEqual(grids[0]);
      // Below the face (row 13 and down) every Pip is the same.
      expect(grid.slice(13)).toEqual(grids[0]?.slice(13));
    }
  });
});
