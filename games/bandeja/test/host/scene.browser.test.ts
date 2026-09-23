import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { world } from "@couchcade/theme";
import { RoomCodePanel, Scoreboard, StageScene, safeArea } from "@couchcade/stage";
import { GameObjects } from "phaser";
import game from "../../src/index.ts";
import { instructionPanelRect } from "../../src/host/overlays.ts";
import { farEdgeSy, nearEdgeSy } from "../../src/host/layout.ts";
import type BandejaScene from "../../src/host/scene.ts";
import type { Phase } from "../../src/shared/index.ts";
import { spreadBots } from "./bots.ts";
import { destroyStage, shown, startScene, tv, visibleTexts } from "./stage.ts";
import type { Run } from "./stage.ts";

/**
 * The TV scene in headless Chromium (docs/games/bandeja.md, "TV scene"; CC-23.4 acceptance
 * criterion 3: "A headless boot test renders one full round without errors"). CI renders with a
 * software GPU, so only the output-resolution check pays for a 1080p canvas; the whole-match run
 * uses a smaller canvas, which the stage fits the same way.
 */

let run: Run | null = null;
let problems: unknown[] = [];

beforeEach(() => {
  problems = [];
});

afterEach(() => {
  destroyStage(run?.stage ?? null);
  run = null;
});

const halfTv = { width: tv.width / 2, height: tv.height / 2 } as const;

function overlayOf<T>(scene: BandejaScene, type: abstract new (...args: never[]) => T): T[] {
  return scene.overlay.list.filter(
    (child): child is T & GameObjects.GameObject => child instanceof type,
  );
}

describe("Bandeja TV scene", () => {
  it("loads through the game's hostScene loader and extends StageScene", async () => {
    await expect(game.hostScene()).resolves.toBeDefined();
    const SceneClass = await game.hostScene();
    expect(SceneClass.prototype).toBeInstanceOf(StageScene);
  });

  it("keeps the near-edge court clear of the bottom instruction panel (finding 11)", () => {
    const panel = instructionPanelRect();
    // safeArea and instructionPanelRect are overlay pixels (1080p); the court's edges are world
    // pixels. 4 overlay px per world px (packages/stage/src/layout/index.ts).
    const panelTopWorld = panel.y / 4;
    const scoreboardBottomWorld = (safeArea.top + 4 + 8 + 72 + 6) / 4;
    expect(nearEdgeSy).toBeLessThan(panelTopWorld);
    expect(farEdgeSy).toBeGreaterThan(scoreboardBottomWorld);
  });

  it(
    "renders the 480×270 world at a whole-number zoom and plays a full match without errors",
    // CI runs this alongside every other game's browser suite on a shared 2-core runner, and a
    // full match now ticks each pip's live movement/CPU AI (CC-23.8) every frame; 90 s was too
    // tight there (observed ~120 s) though it's ~10 s in isolation. Matches quick-draw's and
    // target-range's headroom for their own heaviest full-match tests.
    { timeout: 180_000 },
    async () => {
      const originalError = console.error;
      const originalWarn = console.warn;
      console.error = (...args: unknown[]) => problems.push(args);
      console.warn = (...args: unknown[]) => problems.push(args);
      try {
        run = await startScene(4, 3, spreadBots, { canvas: halfTv });
        const { stage, scene } = run;
        const zoom = 2;
        expect([stage.canvas.width, stage.canvas.height]).toEqual([halfTv.width, halfTv.height]);
        expect(scene.cameras.main.zoom).toBe(zoom);
        expect(scene.viewport).toMatchObject({ x: 0, y: 0, width: world.width * zoom });

        // The stage overlays: the scoreboard with a chip per player, the room code panel bottom
        // right and the game's own instruction panel left of it.
        const scoreboard = overlayOf(scene, Scoreboard)[0];
        const [roomCode] = overlayOf(scene, RoomCodePanel);
        if (!scoreboard || !roomCode) throw new Error("expected the stage overlays");
        expect(scoreboard.chips.map((chip) => chip.name)).toEqual(["Noor", "Sam", "Kim", "Alex"]);
        expect([roomCode.code, roomCode.url]).toEqual(["BEAN", "couchcade.workers.dev"]);

        const phases = new Set<Phase>();
        const seen = new Set<string>();
        let state = run.frame();
        // Bounded well under the match's own 6-minute clock cap: a real match with these bots
        // reaches `over` in a few thousand ticks.
        for (let tick = 0; state.phase !== "over" && tick < 60 * 60 * 6; tick++) {
          phases.add(state.phase);
          if (tick % 5 === 0 || phases.size < 5) {
            run.render();
            for (const text of visibleTexts(scene)) seen.add(`${state.phase}:${text.text}`);
            for (const image of shown(scene)) {
              if (image instanceof GameObjects.Image) {
                seen.add(`${state.phase}:${image.texture.key.split(":")[1]}`);
              }
            }
            if (!scene.sys.isActive()) throw new Error(`scene stopped at tick ${tick}`);
          }
          state = run.tick();
        }
        phases.add(state.phase);
        run.render();
        for (const text of visibleTexts(scene)) seen.add(`${state.phase}:${text.text}`);

        expect(state.phase).toBe("over");
        expect(phases).toEqual(new Set<Phase>(["intro", "serve", "rally", "pointEnd", "over"]));
        expect(seen).toContain("intro:Swing when the ring closes");
        expect(seen).toContain("serve:ball");
        expect(seen).toContain("rally:ball");
        expect([...seen].some((entry) => entry.startsWith("pointEnd:"))).toBe(true);
        expect(
          run.cues.map((cue) => cue.type).filter((type) => type === "point" || type === "net"),
        ).not.toHaveLength(0);
        expect(run.cues.some((cue) => cue.type === "matchEnd")).toBe(true);
        expect(problems).toEqual([]);
      } finally {
        console.error = originalError;
        console.warn = originalWarn;
      }
    },
  );

  it("starts without a room code panel when the host gives no room code", async () => {
    run = await startScene(2, 1, spreadBots, { room: false });
    run.frame();
    expect(run.scene.overlay.list.some((child) => child instanceof RoomCodePanel)).toBe(false);
  });
});
