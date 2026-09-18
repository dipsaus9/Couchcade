import type { PipProfile } from "@couchcade/protocol";
import { color, pip, players, toPhaserColor } from "@couchcade/theme";
import type { Hex } from "@couchcade/theme";
import { pipParts } from "@couchcade/utils/pips";
import type { GameObjects, Scene } from "phaser";
import { describe, expect, it } from "vitest";
import {
  buildWorldPip,
  drawWorldPipMarker,
  pipExpressions,
  worldPipKey,
  worldPipOrigin,
  worldPipSize,
} from "../src/pips/index.ts";
import type { WorldPipFace, WorldPipLook } from "../src/pips/index.ts";
import { StageScene } from "../src/scene/index.ts";
import { boot, expectedColour, hex } from "./boot.ts";

const profile: PipProfile = { skin: 3, hair: 0, hairColour: 0 };

/** Reads a Phaser canvas texture's pixels back directly, without rendering a frame (the same
 * technique games/target-range/src/host/world.ts already uses for its own sprite textures). */
function readTexture(scene: Scene, key: string) {
  const source = scene.textures.get(key).getSourceImage() as HTMLCanvasElement;
  const { width, height } = source;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("No 2D context");
  context.drawImage(source, 0, 0);
  const data = context.getImageData(0, 0, width, height).data;
  return {
    pixel: (x: number, y: number): Hex | null => {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (!a) return null;
      return hex(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0)) as Hex;
    },
  };
}

describe("buildWorldPip", () => {
  it("builds a 16×24 canvas texture", async () => {
    const { scene } = await boot(StageScene);
    const key = buildWorldPip(scene, { profile, slot: 0 });
    const source = scene.textures.get(key).getSourceImage() as HTMLCanvasElement;
    expect(source.width).toBe(worldPipSize.width);
    expect(source.height).toBe(worldPipSize.height);
  });

  it("keys the texture pip:world:<skin>-<hair>-<hairColour>-<slot>-<expression>-<eyes>", () => {
    const look: WorldPipLook = { profile: { skin: 2, hair: 3, hairColour: 5 }, slot: 4 };
    expect(worldPipKey(look, { expression: "happy" })).toBe("pip:world:2-3-5-4-happy-open");
    expect(worldPipKey(look, { expression: "happy", blink: true })).toBe(
      "pip:world:2-3-5-4-happy-blink",
    );
  });

  it("caches the texture: a second call for the same look and face reuses the key", async () => {
    const { scene } = await boot(StageScene);
    const look: WorldPipLook = { profile, slot: 1 };
    const first = buildWorldPip(scene, look);
    expect(scene.textures.exists(first)).toBe(true);
    const second = buildWorldPip(scene, look);
    expect(second).toBe(first);
  });

  it.each(players.map((player, slot) => [slot, player.id, player.color] as const))(
    "paints the jersey in slot %s's player colour (%s) with the Chalk chest mark",
    (slot, _id, jerseyHex) => {
      const scene = { textures: fakeTextures() } as unknown as Scene;
      const key = buildWorldPip(scene, { profile, slot });
      const texture = readTexture(scene, key);
      // Row 18, column 2 sits inside the jersey body but outside the 2×2 chest mark.
      expect(texture.pixel(2, 18)).toBe(expectedColour(jerseyHex));
      expect(texture.pixel(7, 17)).toBe(expectedColour(color.chalk));
      expect(texture.pixel(8, 18)).toBe(expectedColour(color.chalk));
    },
  );

  it("paints the head in the profile's skin tone", () => {
    const scene = { textures: fakeTextures() } as unknown as Scene;
    const skin = 4;
    const key = buildWorldPip(scene, { profile: { ...profile, skin, hair: 7 }, slot: 0 });
    const texture = readTexture(scene, key);
    // (7, 7) sits at the centre of the head circle; hair 7 is bald, so nothing overwrites it.
    expect(texture.pixel(7, 7)).toBe(expectedColour(pip.skin[skin] as Hex));
  });

  it("draws a 1px Ink outline around the sprite", () => {
    const scene = { textures: fakeTextures() } as unknown as Scene;
    const key = buildWorldPip(scene, { profile, slot: 0 });
    const texture = readTexture(scene, key);
    // The head circle's topmost filled row is y=3 (columns 5-10); the outline sits at y=2.
    expect(texture.pixel(7, 3)).not.toBeNull();
    expect(texture.pixel(7, 2)).toBe(expectedColour(color.ink));
  });

  it.each(pipParts.hair.map((id, hair) => [hair, id] as const))(
    "renders hairstyle %s (%s) without throwing",
    (hair) => {
      const scene = { textures: fakeTextures() } as unknown as Scene;
      expect(() => buildWorldPip(scene, { profile: { ...profile, hair }, slot: 0 })).not.toThrow();
    },
  );

  it("gives bald no hair layer: its texture differs from every other hairstyle's", () => {
    const scene = { textures: fakeTextures() } as unknown as Scene;
    const baldHair = pipParts.hair.indexOf("bald");
    const baldKey = buildWorldPip(scene, { profile: { ...profile, hair: baldHair }, slot: 2 });
    const bald = readTexture(scene, baldKey);
    for (const hair of pipParts.hair.keys()) {
      if (hair === baldHair) continue;
      const key = buildWorldPip(scene, { profile: { ...profile, hair }, slot: 2 });
      const other = readTexture(scene, key);
      let differs = false;
      for (let y = 0; y < worldPipSize.height && !differs; y++) {
        for (let x = 0; x < worldPipSize.width; x++) {
          if (bald.pixel(x, y) !== other.pixel(x, y)) {
            differs = true;
            break;
          }
        }
      }
      expect(differs, `bald vs ${pipParts.hair[hair]}`).toBe(true);
    }
  });

  it.each(pipExpressions)("builds the %s expression without throwing", (expression) => {
    const scene = { textures: fakeTextures() } as unknown as Scene;
    const face: WorldPipFace = { expression };
    expect(() => buildWorldPip(scene, { profile, slot: 0 }, face)).not.toThrow();
    expect(() =>
      buildWorldPip(scene, { profile, slot: 0 }, { ...face, blink: true }),
    ).not.toThrow();
  });

  it("wraps an out-of-range slot or profile index instead of throwing", () => {
    const scene = { textures: fakeTextures() } as unknown as Scene;
    expect(() =>
      buildWorldPip(scene, { profile: { skin: 99, hair: -3, hairColour: 12 }, slot: 20 }),
    ).not.toThrow();
  });
});

describe("worldPipOrigin", () => {
  it("puts the top-left pixel 8px left and 24px above the feet", () => {
    expect(worldPipOrigin(100, 200)).toEqual({ x: 92, y: 176 });
  });
});

describe("drawWorldPipMarker", () => {
  it("draws the seat's shape with its top-left at (x-5, feetY), in the seat's colour", () => {
    const graphics = fakeGraphics();
    const slot = 0; // cherry, circle
    drawWorldPipMarker(graphics, slot, 100, 200);
    const seat = players[slot] as (typeof players)[number];

    // drawPlayerShape draws a 9×9 box (the 7×7 mask plus its 1px outline) starting one pixel
    // left of and above the shape param it's given; drawWorldPipMarker passes (x-5, feetY), so
    // the whole marked box's top-left lands exactly there (pips.md "In a scene").
    const xs = graphics.fills.map((f) => f.x);
    const ys = graphics.fills.map((f) => f.y);
    expect(Math.min(...xs)).toBe(95);
    expect(Math.min(...ys)).toBe(200);
    expect(Math.max(...xs)).toBeLessThanOrEqual(95 + 9);
    expect(Math.max(...ys)).toBeLessThanOrEqual(200 + 9);

    expect(graphics.fills.some((f) => f.style === toPhaserColor(seat.color))).toBe(true);
  });
});

/** A Graphics stand-in recording `fillRect` calls, so a test can check drawPlayerShape's actual
 * pixel positions without booting Phaser and fighting the world camera's zoom and viewport. */
function fakeGraphics(): GameObjects.Graphics & {
  fills: { style: number; x: number; y: number }[];
} {
  let style = 0;
  const fills: { style: number; x: number; y: number }[] = [];
  return {
    fillStyle: (colour: number) => {
      style = colour;
    },
    fillRect: (x: number, y: number) => {
      fills.push({ style, x, y });
    },
    fills,
  } as unknown as GameObjects.Graphics & { fills: typeof fills };
}

/** A texture manager over a bare object, for tests that only need `createCanvas`/`get`/`exists`
 * and don't need a full Phaser Game (faster: no boot, no renderer). */
function fakeTextures() {
  const canvases = new Map<string, HTMLCanvasElement>();
  return {
    exists: (key: string) => canvases.has(key),
    createCanvas: (key: string, width: number, height: number) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvases.set(key, canvas);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("No 2D context");
      return {
        context,
        refresh: () => {},
      };
    },
    get: (key: string) => ({
      getSourceImage: () => {
        const canvas = canvases.get(key);
        if (!canvas) throw new Error(`No texture ${key}`);
        return canvas;
      },
    }),
  };
}
