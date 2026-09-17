import type { HostSceneData } from "@couchcade/game-sdk/contract";
import type { PlayerInfo } from "@couchcade/protocol";
import { color, toPhaserColor } from "@couchcade/theme";
import type { Hex } from "@couchcade/theme";
import { AUTO, Game, Scenes } from "phaser";
import type { Display, Scene } from "phaser";
import { afterEach, vi } from "vitest";
import { overlayFrame } from "../src/layout/index.ts";
import type { Rect } from "../src/layout/index.ts";

const games: Game[] = [];

afterEach(() => {
  for (const game of games.splice(0)) game.destroy(true);
  document.body.replaceChildren();
});

let fonts: Promise<void> | null = null;

/**
 * Loads the self-hosted house style fonts (CC-4.3) from packages/theme/fonts, the files the host
 * serves, so text measures and renders as on the TV instead of in a fallback font.
 */
export function loadFonts(): Promise<void> {
  fonts ??= (async () => {
    const fredoka = new URL("../../theme/fonts/fredoka/fredoka.woff2", import.meta.url);
    const pixelify = new URL(
      "../../theme/fonts/pixelify-sans/pixelify-sans.woff2",
      import.meta.url,
    );
    const faces = [
      new FontFace("Fredoka", `url(${fredoka.href})`, { weight: "500 700" }),
      new FontFace("Pixelify Sans", `url(${pixelify.href})`, { weight: "700" }),
    ];
    for (const face of faces) document.fonts.add(await face.load());
  })();
  return fonts;
}

/**
 * Boots Phaser the way the host does (pixel art, Sky background, the house style fonts loaded) on
 * a canvas of `canvas` pixels, 1920×1080 unless given, and starts `SceneClass` with `data`.
 * Resolves once the scene's `create` has run.
 */
export async function boot<S extends Scene>(
  SceneClass: new () => S,
  data?: object,
  canvas: { width: number; height: number } = overlayFrame,
): Promise<{ game: Game; scene: S }> {
  await loadFonts();
  const parent = document.createElement("div");
  document.body.append(parent);
  const game = new Game({
    type: AUTO,
    parent,
    width: canvas.width,
    height: canvas.height,
    backgroundColor: color.sky,
    pixelArt: true,
    banner: false,
    audio: { noAudio: true },
    scene: [],
  });
  games.push(game);
  await new Promise<void>((resolve) => game.events.once("ready", () => resolve()));
  game.scene.add("test", SceneClass, true, data);
  const scene = game.scene.getScene("test") as S;
  await vi.waitFor(() => {
    if (scene.sys.settings.status !== Scenes.RUNNING) throw new Error("Scene not running yet");
  });
  return { game, scene };
}

/** The colour of one rendered pixel, as `0xRRGGBB`, read back after the next frame. */
export function pixel(game: Game, x: number, y: number): Promise<number> {
  return new Promise((resolve) => {
    game.renderer.snapshotPixel(x, y, (snapshot) => resolve((snapshot as Display.Color).color));
  });
}

/** The RGBA pixels of a canvas area, read back after the next frame. */
export function readArea(game: Game, rect: Rect): Promise<Uint8ClampedArray> {
  return new Promise((resolve) => {
    game.renderer.snapshotArea(rect.x, rect.y, rect.width, rect.height, (snapshot) => {
      const image = snapshot as HTMLImageElement;
      const read = () => {
        const canvas = document.createElement("canvas");
        canvas.width = rect.width;
        canvas.height = rect.height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("No 2D context");
        context.drawImage(image, 0, 0);
        resolve(context.getImageData(0, 0, rect.width, rect.height).data);
      };
      if (image.complete) read();
      else image.addEventListener("load", read, { once: true });
    });
  });
}

/** How many pixels in `rect` have exactly the colour `colour`, read back after the next frame. */
export async function countColour(game: Game, rect: Rect, colour: Hex): Promise<number> {
  const target = toPhaserColor(colour);
  const data = await readArea(game, rect);
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    const value = ((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0);
    if (value === target) count += 1;
  }
  return count;
}

/** The first colour as a readable hex, so a failing pixel check shows what it found. */
export function hex(value: number): string {
  return `#${value.toString(16).toUpperCase().padStart(6, "0")}`;
}

/** A player as the relay describes it. */
export function player(
  id: string,
  name: string,
  slot: number | null,
  joinedAt: number,
  connected = true,
): PlayerInfo {
  return { id, name, slot, joinedAt, connected, profile: { skin: 0, hair: 0, hairColour: 0 } };
}

/** Host scene data as the runtime passes it. */
export function hostData(overrides: Partial<HostSceneData<unknown>> = {}): HostSceneData<unknown> {
  return {
    getState: () => ({}),
    players: [],
    displayLagMs: 0,
    reducedMotion: false,
    ...overrides,
  };
}

export const expectedColour = (value: Hex) => hex(toPhaserColor(value));
