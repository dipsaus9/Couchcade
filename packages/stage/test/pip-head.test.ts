import type { PipProfile } from "@couchcade/protocol";
import { color, pip as pipColours, players } from "@couchcade/theme";
import type { Hex } from "@couchcade/theme";
import { pipHairstyleIds } from "@couchcade/theme";
import type { Scene } from "phaser";
import { describe, expect, it } from "vitest";
import {
  buildInterfacePipHead,
  interfacePipHeadKey,
  interfacePipHeadSize,
  interfacePipHeadTextureScale,
} from "../src/scoreboard/pip-head.ts";
import { StageScene } from "../src/scene/index.ts";
import { boot, expectedColour, hex } from "./boot.ts";

const profile: PipProfile = { skin: 3, hair: 0, hairColour: 0 };

/** Reads a Phaser canvas texture's pixels back directly (mirrors test/pips.test.ts's helper). */
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

describe("buildInterfacePipHead", () => {
  it("builds a texture baked at 2x the 56px display size", async () => {
    const { scene } = await boot(StageScene);
    const key = buildInterfacePipHead(scene, { profile, slot: 0 });
    const source = scene.textures.get(key).getSourceImage() as HTMLCanvasElement;
    expect(source.width).toBe(interfacePipHeadSize * interfacePipHeadTextureScale);
    expect(source.height).toBe(interfacePipHeadSize * interfacePipHeadTextureScale);
  });

  it("keys the texture pip:head:<skin>-<hair>-<hairColour>-<slot>-<expression>", () => {
    const look = { profile: { skin: 2, hair: 3, hairColour: 5 }, slot: 4 };
    expect(interfacePipHeadKey(look)).toBe("pip:head:2-3-5-4-neutral");
    expect(interfacePipHeadKey({ ...look, expression: "happy" })).toBe("pip:head:2-3-5-4-happy");
  });

  it("keys an audience Pip (no seat) with 'aud'", () => {
    expect(interfacePipHeadKey({ profile, slot: null })).toBe("pip:head:3-0-0-aud-neutral");
  });

  it("caches the texture: a second call for the same look reuses the key without rebuilding", async () => {
    const { scene } = await boot(StageScene);
    const first = buildInterfacePipHead(scene, { profile, slot: 2 });
    const existsAfterFirst = scene.textures.exists(first);
    const second = buildInterfacePipHead(scene, { profile, slot: 2 });
    expect(second).toBe(first);
    expect(existsAfterFirst).toBe(true);
  });

  it("paints the head circle in the profile's skin tone at the texture centre", async () => {
    const { scene } = await boot(StageScene);
    const key = buildInterfacePipHead(scene, { profile, slot: 0 });
    const texture = readTexture(scene, key);
    const centre = (interfacePipHeadSize * interfacePipHeadTextureScale) / 2;
    expect(texture.pixel(centre, centre)).toBe(expectedColour(pipColours.skin[profile.skin]!));
  });

  it("colours the jersey sliver at the bottom of the crop with the seat's player colour", async () => {
    const { scene } = await boot(StageScene);
    const slot = 1;
    const key = buildInterfacePipHead(scene, { profile, slot });
    const texture = readTexture(scene, key);
    // The jersey's shoulders sit near the crop's bottom edge (pips.md "Interface Pip"): a pixel
    // just off-centre, near the bottom, lands on the player-coloured jersey rather than the head.
    const scale = (interfacePipHeadSize * interfacePipHeadTextureScale) / 88;
    const x = Math.round((50 - 6) * scale);
    const y = Math.round((90 - 4) * scale);
    expect(texture.pixel(x, y)).toBe(expectedColour(players[slot]!.color));
  });

  it("gives an audience Pip (no seat) a Chalk jersey", async () => {
    const { scene } = await boot(StageScene);
    const key = buildInterfacePipHead(scene, { profile, slot: null });
    const texture = readTexture(scene, key);
    const scale = (interfacePipHeadSize * interfacePipHeadTextureScale) / 88;
    const x = Math.round((50 - 6) * scale);
    const y = Math.round((90 - 4) * scale);
    expect(texture.pixel(x, y)).toBe(expectedColour(color.chalk));
  });

  it("builds a texture for every hairstyle, bald included, without throwing", async () => {
    const { scene } = await boot(StageScene);
    const built = pipHairstyleIds.map((_, hair) =>
      buildInterfacePipHead(scene, { profile: { ...profile, hair }, slot: 0 }),
    );
    expect(built.every((key) => scene.textures.exists(key))).toBe(true);
  });

  it("builds a texture for every expression without throwing", async () => {
    const { scene } = await boot(StageScene);
    const expressions = ["neutral", "happy", "surprised", "sad"] as const;
    const built = expressions.map((expression) =>
      buildInterfacePipHead(scene, { profile, slot: 0, expression }),
    );
    expect(built.every((key) => scene.textures.exists(key))).toBe(true);
  });
});
