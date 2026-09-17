import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toPhaserColor, typeScale, world } from "@couchcade/theme";
import type { Hex } from "@couchcade/theme";
import { tickMs } from "@couchcade/game-sdk/contract";
import { Callout, RoomCodePanel, Scoreboard, StageScene, safeArea } from "@couchcade/stage";
import { GameObjects } from "phaser";
import type { Display, Game } from "phaser";
import game from "../../src/index.ts";
import { art } from "../../src/host/art.ts";
import { overlaps, stubBox } from "../../src/host/label-layout.ts";
import type { Box } from "../../src/host/label-layout.ts";
import {
  InstructionPanel,
  PointsTag,
  RoundResults,
  instructionPanelRect,
  scoreboardBottom,
} from "../../src/host/overlays.ts";
import TargetRangeScene from "../../src/host/scene.ts";
import { worldPipLook } from "../../src/host/world-pip.ts";
import { pipSlots } from "../../src/host/layout.ts";
import { volleyOf } from "../../src/shared/index.ts";
import type { Phase, TargetRangeState } from "../../src/shared/index.ts";
import { spreadBots } from "./bots.ts";
import { destroyStage, shown, startScene, tv, visibleTexts } from "./stage.ts";
import type { Run } from "./stage.ts";

/**
 * The TV scene in headless Chromium. CI renders with a software GPU, so only the output
 * resolution test pays for a 1080p canvas, and it renders a handful of frames; the long runs use
 * smaller canvases, which the stage fits the same way. Overlays are laid out in 1080p overlay
 * pixels whatever the canvas size.
 */

let run: Run | null = null;
let problems: unknown[] = [];

beforeEach(() => {
  problems = [];
  vi.spyOn(console, "error").mockImplementation((...args) => problems.push(args));
  vi.spyOn(console, "warn").mockImplementation((...args) => problems.push(args));
});

afterEach(() => {
  vi.restoreAllMocks();
  destroyStage(run?.stage ?? null);
  run = null;
});

const halfTv = { width: tv.width / 2, height: tv.height / 2 } as const;

function readPixel(stage: Game, x: number, y: number): Promise<number> {
  return new Promise((resolve) => {
    stage.renderer.snapshotPixel(x, y, (snapshot) => {
      const { red, green, blue } = snapshot as Display.Color;
      resolve((red << 16) | (green << 8) | blue);
    });
    stage.step(1e6, tickMs);
  });
}

/** The RGBA pixels of a canvas area, read back after the next frame. */
function readArea(stage: Game, area: { x: number; y: number; width: number; height: number }) {
  return new Promise<Uint8ClampedArray>((resolve) => {
    stage.renderer.snapshotArea(area.x, area.y, area.width, area.height, (snapshot) => {
      const image = snapshot as HTMLImageElement;
      const read = () => {
        const canvas = document.createElement("canvas");
        canvas.width = area.width;
        canvas.height = area.height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("No 2D context");
        context.drawImage(image, 0, 0);
        resolve(context.getImageData(0, 0, area.width, area.height).data);
      };
      if (image.complete) read();
      else image.addEventListener("load", read, { once: true });
    });
    stage.step(1e6, tickMs);
  });
}

const hex = (value: number) => `#${value.toString(16).toUpperCase().padStart(6, "0")}`;
const expectPixel = async (stage: Game, x: number, y: number, expected: Hex) =>
  expect(hex(await readPixel(stage, x, y))).toBe(hex(toPhaserColor(expected)));

const boxOf = (rect: { left: number; top: number; right: number; bottom: number }): Box => ({
  left: rect.left,
  top: rect.top,
  right: rect.right,
  bottom: rect.bottom,
});

const inside = (inner: Box, outer: Box): boolean =>
  inner.left >= outer.left &&
  inner.top >= outer.top &&
  inner.right <= outer.right &&
  inner.bottom <= outer.bottom;

const safeBox: Box = {
  left: safeArea.left,
  top: safeArea.top,
  right: safeArea.right,
  bottom: safeArea.bottom,
};

/** Ticks without rendering until `done`, then renders one frame of that state. */
function tickUntil(target: Run, done: (state: TargetRangeState) => boolean): TargetRangeState {
  let state = target.tick();
  for (let i = 0; i < 60 * 60 * 5 && !done(state); i++) state = target.tick();
  if (!done(state)) throw new Error("Never reached the state");
  target.render();
  return state;
}

function overlayOf<T>(scene: TargetRangeScene, type: abstract new (...args: never[]) => T): T[] {
  return scene.overlay.list.filter(
    (child): child is T & GameObjects.GameObject => child instanceof type,
  );
}

/** Checks that no two points tags overlap, each sits under the scoreboard and its text fits it. */
function tagClashes(scene: TargetRangeScene, where: string): string[] {
  const clashes: string[] = [];
  const tags = overlayOf(scene, PointsTag).filter((tag) => tag.visible);
  for (const tag of tags) {
    const box = tag.box;
    const label = tag.label;
    if (!box || !label) continue;
    if (!inside(box, safeBox)) clashes.push(`${where}: ${tag.text} leaves the safe area`);
    if (box.top < scoreboardBottom) clashes.push(`${where}: ${tag.text} covers the scoreboard`);
    if (tag.scale === 1 && !inside(boxOf(label.getBounds()), box)) {
      clashes.push(`${where}: ${tag.text} sticks out of its pill`);
    }
  }
  tags.forEach((tag, index) => {
    for (const other of tags.slice(index + 1)) {
      if (tag.box && other.box && overlaps(tag.box, other.box)) {
        clashes.push(`${where}: ${tag.text} covers ${other.text}`);
      }
    }
  });
  return clashes;
}

describe("Target Range TV scene", () => {
  it("loads through the game's hostScene loader and extends StageScene", async () => {
    await expect(game.hostScene()).resolves.toBe(TargetRangeScene);
    expect(TargetRangeScene.prototype).toBeInstanceOf(StageScene);
  });

  it(
    "renders the 480×270 world at a whole-number zoom and one full round without errors",
    { timeout: 120_000 },
    async () => {
      run = await startScene(4, 3, spreadBots, { canvas: halfTv });
      const { stage, scene } = run;
      const zoom = 2;
      expect([stage.canvas.width, stage.canvas.height]).toEqual([halfTv.width, halfTv.height]);
      expect(scene.cameras.main.zoom).toBe(zoom);
      expect(scene.viewport).toMatchObject({ x: 0, y: 0, width: world.width * zoom });

      // The world really drew: sky, grass, the gold centre of the target and the first Pip's jersey.
      const start = scene.hostData?.getState() as TargetRangeState;
      await expectPixel(stage, 200 * zoom, 48 * zoom, art.sky);
      await expectPixel(stage, 240 * zoom, 200 * zoom, art.grass);
      await expectPixel(stage, start.target.x * zoom, start.target.y * zoom, art.bands[4]);
      const [slot] = pipSlots(4);
      const player = scene.hostData?.players[0];
      if (!slot || !player) throw new Error("expected a Pip slot and a player");
      const jersey = worldPipLook(player.slot ?? 0, player.profile).jersey;
      await expectPixel(stage, (slot.x - 4) * zoom, (slot.feetY - 3) * zoom, jersey);

      // The stage overlays: the scoreboard with a chip per player and the round counter, the room
      // code panel bottom-right and the instruction panel left of it.
      const scoreboard = overlayOf(scene, Scoreboard)[0];
      const [panel] = overlayOf(scene, InstructionPanel);
      const [roomCode] = overlayOf(scene, RoomCodePanel);
      if (!scoreboard || !panel || !roomCode) throw new Error("expected the stage overlays");
      expect(scoreboard.chips.map((chip) => chip.name)).toEqual(["Noor", "Sam", "Kim", "Alex"]);
      expect(scoreboard.roundCounterBounds).not.toBeNull();
      expect([roomCode.code, roomCode.url]).toEqual(["BEAN", "couchcade.workers.dev"]);
      expect(roomCode.panelBounds.x + roomCode.panelBounds.width).toBe(safeArea.right);
      expect(panel.rect.x + panel.rect.width).toBeLessThan(roomCode.panelBounds.x);

      const phases: Phase[] = [];
      const seen = new Set<string>();
      let framesWithoutRoomCode = 0;
      let mostCrosshairs = 0;
      let state = run.frame();
      while (state.round === 1 || state.phase !== "intro") {
        if (phases.at(-1) !== state.phase) phases.push(state.phase);
        const onScreen = shown(scene);
        for (const text of visibleTexts(scene)) seen.add(`${state.phase}:${text.text}`);
        if (!onScreen.includes(roomCode)) framesWithoutRoomCode += 1;
        const crosshairs = [...scene.rangeWorld.crosshairs.values()].filter((c) => c.ring.visible);
        mostCrosshairs = Math.max(mostCrosshairs, crosshairs.length);
        for (const image of onScreen) {
          if (image instanceof GameObjects.Image)
            seen.add(`${state.phase}:${image.texture.key.split(":")[1]}`);
        }
        if (overlayOf(scene, RoundResults)[0]?.visible) seen.add(`${state.phase}:results`);
        state = run.frame();
        expect(scene.sys.isActive()).toBe(true);
      }

      for (const text of visibleTexts(scene)) seen.add(`${state.phase}:${text.text}`);
      expect(framesWithoutRoomCode).toBe(0);
      expect(phases).toEqual([
        "intro",
        "open",
        "landing",
        "reveal",
        "open",
        "landing",
        "reveal",
        "open",
        "landing",
        "reveal",
        "roundEnd",
      ]);
      expect(mostCrosshairs).toBe(4);
      expect(seen).toContain("intro:Point at the TV, pull down, let go");
      expect(seen).toContain("open:Arrow 1 of 3, no wind");
      expect(seen).toContain("open:10");
      expect(seen).toContain("open:crosshair");
      expect(seen).toContain("open:arrow");
      expect(seen).toContain("open:stub");
      expect(seen).toContain("reveal:BULLSEYE!");
      expect(seen).toContain("reveal:Noor hit a 10");
      expect(seen).toContain("reveal:MISS");
      expect(seen).toContain("roundEnd:Scores after round 1 of 4");
      expect(seen).toContain("roundEnd:results");
      expect(seen).toContain("roundEnd:Round");
      expect(seen).toContain("roundEnd:1/4");
      expect(seen).toContain("intro:Round 2 of 4: middle");
      expect(run.cues.map((cue) => cue.type)).toEqual(
        expect.arrayContaining(["open", "draw", "shoot", "land", "reveal", "roundEnd", "round"]),
      );
      expect(problems).toEqual([]);
    },
  );

  it(
    "draws the overlay text at the 1920×1080 output resolution, readable with 8 players",
    { timeout: 120_000 },
    async () => {
      run = await startScene(8, 3, spreadBots, { canvas: tv });
      const { stage, scene } = run;
      const overlayCamera = scene.overlayCamera;
      if (!overlayCamera) throw new Error("expected the overlay camera");
      expect(overlayCamera.zoom).toBe(1);

      const checkTexts = (expected: string[]) => {
        const texts = visibleTexts(scene);
        expect(texts.map((text) => text.text)).toEqual(expect.arrayContaining(expected));
        const drawn = texts.map((text) => {
          let root: GameObjects.GameObject = text;
          while (root.parentContainer) root = root.parentContainer;
          const matrix = text.getWorldTransformMatrix();
          return {
            text: text.text,
            // A callout still scaling in from 0 doesn't render yet, but it is on the overlay camera.
            onOverlayCamera:
              text instanceof Callout
                ? (text.cameraFilter & overlayCamera.id) === 0
                : text.willRender(overlayCamera),
            onWorldCamera: root.willRender(scene.cameras.main),
            resolution: [text.style.resolution, text.frame.source.resolution],
            // A callout may still be scaling in: its size comes from the stage.
            scale: text instanceof Callout ? 1 : Math.hypot(matrix.a, matrix.b),
            // Nothing on the TV is smaller than 24px at 1080p (HOUSE_STYLE "Readable from the couch").
            readable: Number.parseFloat(String(text.style.fontSize)) >= typeScale.small.tv,
          };
        });
        expect(drawn).toEqual(
          texts.map((text) => ({
            text: text.text,
            onOverlayCamera: true,
            onWorldCamera: false,
            resolution: [1, 1],
            scale: expect.closeTo(1, 6),
            readable: true,
          })),
        );
        return texts;
      };

      // The reveal of the first volley, once the points tags have popped in.
      tickUntil(run, (state) => state.phase === "reveal" && state.nowMs - state.phaseAtMs > 300);
      const texts = checkTexts(["Noor hit a 10", "10", "BULLSEYE!", "BEAN", "1/4"]);
      expect(tagClashes(scene, "reveal")).toEqual([]);
      expect(overlayOf(scene, PointsTag).filter((tag) => tag.visible)).toHaveLength(8);

      // The instruction line, read back from the canvas: glyph edges fall on single canvas pixels.
      // Text drawn in the 480×270 world and scaled ×4 would fill every 4×4 block evenly.
      const line = texts.find((text) => text.text === "Noor hit a 10");
      if (!line) throw new Error("expected the instruction line");
      const bounds = line.getBounds();
      const area = {
        x: Math.floor(bounds.x / 4) * 4,
        y: Math.floor(bounds.y / 4) * 4,
        width: Math.ceil(bounds.width / 4) * 4,
        height: Math.ceil(bounds.height / 4) * 4,
      };
      expect(area.y).toBeGreaterThanOrEqual(instructionPanelRect().y);
      const pixels = await readArea(stage, area);
      const dark = (x: number, y: number) => {
        const i = (y * area.width + x) * 4;
        return (pixels[i] ?? 255) + (pixels[i + 1] ?? 255) + (pixels[i + 2] ?? 255) < 3 * 128;
      };
      let inked = 0;
      let mixed = 0;
      for (let by = 0; by < area.height; by += 4) {
        for (let bx = 0; bx < area.width; bx += 4) {
          let count = 0;
          for (let y = by; y < by + 4; y++)
            for (let x = bx; x < bx + 4; x++) if (dark(x, y)) count += 1;
          if (count > 0) inked += 1;
          if (count > 0 && count < 16) mixed += 1;
        }
      }
      expect(inked).toBeGreaterThan(50);
      expect(mixed / inked).toBeGreaterThan(0.5);

      // The round's results: every line inside the panel, rows apart, the panel between the
      // scoreboard and the bottom panels.
      tickUntil(run, (state) => state.phase === "roundEnd" && state.nowMs - state.phaseAtMs > 300);
      checkTexts(["Scores after round 1 of 4", "Noor", "Theo", "Arrows", "Round", "Total"]);
      const [results] = overlayOf(scene, RoundResults);
      if (!results) throw new Error("expected the results panel");
      const rect = results.rect;
      const panelBox: Box = {
        left: rect.x,
        top: rect.y,
        right: rect.x + rect.width,
        bottom: rect.y + rect.height,
      };
      expect(inside(panelBox, safeBox)).toBe(true);
      expect(panelBox.top).toBeGreaterThanOrEqual(scoreboardBottom);
      expect(panelBox.bottom).toBeLessThan(instructionPanelRect().y);
      const lines = results.texts.map((text) => ({
        text: text.text,
        box: boxOf(text.getBounds()),
      }));
      expect(lines.filter((entry) => !inside(entry.box, panelBox))).toEqual([]);
      const clashes = lines.flatMap((entry, index) =>
        lines
          .slice(index + 1)
          .filter((other) => overlaps(entry.box, other.box))
          .map((other) => `${entry.text} / ${other.text}`),
      );
      expect(clashes).toEqual([]);
      expect(problems).toEqual([]);
    },
  );

  it(
    "keeps 8 players readable for a whole match: crosshairs stacked in seat order, arrow shapes and points tags apart",
    { timeout: 240_000 },
    async () => {
      run = await startScene(8, 2, spreadBots);
      const { scene } = run;
      const range = scene.rangeWorld;
      const players = scene.hostData?.players ?? [];

      // Each player's ring and shape sit above every earlier seat's, so overlapping crosshairs
      // never swap places.
      const depths = players.flatMap((player) => {
        const crosshair = range.crosshairs.get(player.id);
        return crosshair ? [crosshair.ring.depth, crosshair.shape.depth] : [];
      });
      expect(depths).toHaveLength(16);
      expect(depths).toEqual(depths.toSorted((a, b) => a - b));
      expect(new Set(depths).size).toBe(16);

      const clashes: string[] = [];
      const checked = new Set<string>();
      let mostCrosshairs = 0;
      let state = run.tick();
      for (let frame = 0; state.phase !== "over"; frame++) {
        state = run.tick();
        const settledReveal = state.phase === "reveal" && state.nowMs - state.phaseAtMs > 300;
        if (!settledReveal && frame % 6 !== 0) continue;
        run.render();
        const where = `volley ${volleyOf(state)} ${state.phase} at ${Math.round(state.nowMs)} ms`;

        const crosshairs = [...range.crosshairs.values()].filter((c) => c.ring.visible);
        mostCrosshairs = Math.max(mostCrosshairs, crosshairs.length);
        for (const crosshair of crosshairs) {
          if (!crosshair.shape.visible) clashes.push(`${where}: a crosshair without its shape`);
        }

        const shapes = range.arrowShapeBoxes;
        const stubs = range.stubs
          .filter((stub) => stub.visible)
          .map((stub) => stubBox(stub.x + 2, stub.y + 2));
        shapes.forEach((shape, index) => {
          for (const other of shapes.slice(index + 1)) {
            if (overlaps(shape, other)) clashes.push(`${where}: two arrow shapes overlap`);
          }
          for (const stub of stubs) {
            if (overlaps(shape, stub)) clashes.push(`${where}: an arrow shape covers a stub`);
          }
        });
        if (shapes.length > 0) checked.add(`shapes:${volleyOf(state)}`);
        if (settledReveal) {
          clashes.push(...tagClashes(scene, where));
          checked.add(`tags:${volleyOf(state)}`);
        }
      }

      expect(mostCrosshairs).toBe(8);
      expect(checked.size).toBe(24);
      expect(clashes).toEqual([]);
      expect(problems).toEqual([]);
    },
  );

  it("never shakes the camera or pops tags with reduced motion", { timeout: 60_000 }, async () => {
    run = await startScene(4, 3, spreadBots, { reducedMotion: true });
    const { scene } = run;
    let state = run.frame();
    let tagsSeen = 0;
    while (!(state.phase === "open" && volleyOf(state) === 2)) {
      expect(scene.cameras.main.shakeEffect.isRunning).toBe(false);
      for (const tag of overlayOf(scene, PointsTag)) {
        if (!tag.visible) continue;
        tagsSeen += 1;
        expect(tag.scale).toBe(1);
      }
      state = run.frame();
    }
    expect(tagsSeen).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });

  it("starts without a room code panel when the host gives no room code", async () => {
    run = await startScene(2, 1, spreadBots, { room: false });
    run.frame();
    expect(run.scene.overlay.list.some((child) => child instanceof RoomCodePanel)).toBe(false);
    const [panel] = overlayOf(run.scene, InstructionPanel);
    expect(panel?.rect).toEqual(instructionPanelRect());
    expect(problems).toEqual([]);
  });
});
