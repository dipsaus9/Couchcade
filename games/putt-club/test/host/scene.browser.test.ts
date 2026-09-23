import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { world } from "@couchcade/theme";
import { RoomCodePanel, Scoreboard, StageScene } from "@couchcade/stage";
import { GameObjects } from "phaser";
import game from "../../src/index.ts";
import type PuttClubScene from "../../src/host/scene.ts";
import { PUTT_MIN_SPEED, PUTT_SPEED_RANGE, ROLL_DECEL, course } from "../../src/shared/index.ts";
import type { Phase, PuttClubState } from "../../src/shared/index.ts";
import { destroyStage, shown, startScene, tv, visibleTexts } from "./stage.ts";
import type { Run } from "./stage.ts";

/**
 * The TV scene in headless Chromium (docs/games/putt-club.md, "TV scene"; CC-13.4 acceptance
 * criterion 3: "A headless boot test renders one full round without errors"). CI renders with a
 * software GPU, so only the output-resolution check pays for a 1080p canvas; the whole-match run
 * uses a smaller canvas, which the stage fits the same way.
 *
 * There's no bot AI for Putt Club yet (CC-13.6, a later story, wires the menu and a bot-match E2E
 * test): pure auto-putt play (no input at all) *does* reach `over` on its own -- the turn timer's
 * deadline always fires eventually (docs/games/putt-club.md, "Stroke flow and timings", rule 5)
 * -- but `autoPuttSpeedParam` is deliberately weighted to stop 20% short every time ("Edge cases":
 * "Never an accidental ace"), so it never holes out and every one of the match's 2 x 9 x 6 = 108
 * turns pays the full turn timer. That is far too slow for a test. Instead, `puttStraightAtCup`
 * below sends one calibrated `putt` the instant it's a player's turn: `yaw: 0` always aims at the
 * live cup (the rules compute `bearing(ball, cup)` themselves), and the speed is calibrated to
 * arrive just past the cup under `CAPTURE_SPEED` -- the same maths `physics.test.ts`'s "worked
 * numbers" already exercise, just picked to hole reliably rather than to hit one example distance.
 * That is a hole-in-one on every hole, which finishes the whole match in a few thousand ticks.
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

function overlayOf<T>(scene: PuttClubScene, type: abstract new (...args: never[]) => T): T[] {
  return scene.overlay.list.filter(
    (child): child is T & GameObjects.GameObject => child instanceof type,
  );
}

/** Sends a `putt` straight at the cup, calibrated to arrive a little past it under
 * `CAPTURE_SPEED` -- a reliable hole-in-one, so a test match finishes fast. Only ever queues one
 * `putt` per turn: called every tick, it's a no-op once the phase has moved past `turn`. */
function puttStraightAtCup(activeRun: Run, state: PuttClubState): void {
  if (state.phase !== "turn" || state.putterId === null) return;
  const putter = state.players.find((player) => player.id === state.putterId);
  const hole = course[state.hole - 1];
  if (putter === undefined || hole === undefined) return;
  const distance = Math.hypot(hole.cup[0] - putter.ball[0], hole.cup[1] - putter.ball[1]);
  // A little past the cup, so the ball still carries some (sub-CAPTURE_SPEED) pace crossing it
  // instead of the discretised roll possibly stopping a step short.
  const speed = Math.sqrt(2 * ROLL_DECEL * (distance + 0.25));
  const speedParam = Math.min(1, Math.max(0, (speed - PUTT_MIN_SPEED) / PUTT_SPEED_RANGE));
  activeRun.room.input(state.putterId, {
    type: "putt",
    payload: { turn: state.turn, yaw: 0, speed: speedParam, angle: 0 },
  });
}

describe("Putt Club TV scene", () => {
  it("loads through the game's hostScene loader and extends StageScene", async () => {
    await expect(game.hostScene()).resolves.toBeDefined();
    const SceneClass = await game.hostScene();
    expect(SceneClass.prototype).toBeInstanceOf(StageScene);
  });

  it(
    "renders the 480×270 world at a whole-number zoom and plays a full match without errors",
    // ~13-15s locally, but CI's shared, software-GPU runner needs real headroom for a full
    // 2-player, 9-hole match -- the same CI-only timeout gap CC-23.4 (Bandeja's TV scene boot
    // test) hit and fixed the same way.
    { timeout: 180_000 },
    async () => {
      const originalError = console.error;
      const originalWarn = console.warn;
      console.error = (...args: unknown[]) => problems.push(args);
      console.warn = (...args: unknown[]) => problems.push(args);
      try {
        run = await startScene(2, 3, { canvas: halfTv });
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
        expect(scoreboard.chips.map((chip) => chip.name)).toEqual(["Player 1", "Player 2"]);
        expect([roomCode.code, roomCode.url]).toEqual(["BEAN", "couchcade.workers.dev"]);

        const phases = new Set<Phase>();
        const seen = new Set<string>();
        let state = run.frame();
        // Bounded well under a real worst-case match (108 capped turns): every hole here holes
        // in one, so this finishes in a small fraction of it.
        for (let tick = 0; state.phase !== "over" && tick < 60 * 60 * 5; tick++) {
          phases.add(state.phase);
          puttStraightAtCup(run, state);
          if (tick % 5 === 0 || phases.size < 7) {
            run.render();
            for (const text of visibleTexts(scene)) seen.add(`${state.phase}:${text.text}`);
            for (const image of shown(scene)) {
              if (image instanceof GameObjects.Image) seen.add(`${state.phase}:pip`);
            }
            if (!scene.sys.isActive()) throw new Error(`scene stopped at tick ${tick}`);
          }
          state = run.tick();
        }
        phases.add(state.phase);
        run.render();
        for (const text of visibleTexts(scene)) seen.add(`${state.phase}:${text.text}`);

        expect(state.phase).toBe("over");
        expect(phases).toEqual(
          new Set<Phase>(["intro", "holeIntro", "turn", "rolling", "result", "holeEnd", "over"]),
        );
        // Every player's total is 9 (a hole-in-one on all 9 holes), so the scoreboard reflects it.
        for (const player of state.players) expect(player.total).toBe(9);
        expect(seen).toContain("intro:Putt Club");
        expect(
          [...seen].some((entry) => entry.startsWith("turn:") && entry.endsWith("to putt")),
        ).toBe(true);
        expect([...seen].some((entry) => entry.startsWith("rolling:pip"))).toBe(true);
        // Every hole is a hole-in-one (`puttStraightAtCup`), so the callout fires every time.
        expect(seen).toContain("result:HOLE IN ONE!");
        expect(seen).toContain("over:Match complete");
        expect(problems).toEqual([]);
      } finally {
        console.error = originalError;
        console.warn = originalWarn;
      }
    },
  );

  it("starts without a room code panel when the host gives no room code", async () => {
    run = await startScene(2, 1, { room: false });
    run.frame();
    expect(run.scene.overlay.list.some((child) => child instanceof RoomCodePanel)).toBe(false);
  });
});
