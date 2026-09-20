/**
 * CC-11.10: a shot's aim must match what the TV's crosshair (`createCrosshairPlayback`,
 * `../src/host/aim-playback.ts`) was actually rendering at release, not the phone's freshest live
 * sample (the bug found during the CC-3.24 owner replay) -- on both the direct link and the relay
 * path, whose real `playbackDelayMs` differ by close to 150 ms (`shownDelayMs`,
 * `../src/controller/aim.ts`).
 *
 * Drives the real controller (`createShotAim`) with fake motion, feeds every "aim" sample it
 * actually streamed through the real host reducer (`onPlayerInput`), and checks the shot lands on
 * the exact screen point the host's own `createCrosshairPlayback` renders for that same instant --
 * proving the fix without re-implementing either side's playback math.
 */
import { createPlayers } from "@couchcade/game-sdk/testing";
import type { InputChannel } from "@couchcade/game-sdk/contract";
import { createFakeAdapter } from "@couchcade/motion/sensors";
import { describe, expect, it } from "vitest";
import { createShotAim, shownDelayMs, type TargetRangeMotion } from "../src/controller/aim.ts";
import { createCrosshairPlayback } from "../src/host/aim-playback.ts";
import { aimPoint, init, onPlayerInput } from "../src/shared/index.ts";
import type { TargetRangeInput } from "../src/shared/input.ts";
import { ctxAt, tickUntil } from "./helpers.ts";
import { createTestChannel } from "./controller/channel.ts";
import { virtualTime } from "./controller/clock.ts";
import { flatCalibration, turn } from "./controller/motion.ts";

const [alice] = createPlayers(1) as [ReturnType<typeof createPlayers>[number]];

describe.each([["direct"], ["relay"]] as const)(
  "a Target Range shot's aim matches the TV's shown crosshair (%s link)",
  (path: InputChannel<TargetRangeInput>["path"]) => {
    it("lands on the point createCrosshairPlayback was rendering at release, not the phone's freshest sample", () => {
      const time = virtualTime();
      const { channel, sent, timestamps } = createTestChannel(path);
      const shotAim = createShotAim(channel);
      const adapter = createFakeAdapter();
      const motion: TargetRangeMotion = {
        mode: "motion",
        adapter,
        calibration: flatCalibration(),
      };
      const play = (durationMs: number, gamma: number) => {
        for (const sample of turn(time.now(), durationMs, gamma)) {
          time.advance(Math.max(0, sample.t - time.now()));
          adapter.push(sample);
        }
      };

      shotAim.use(motion);
      play(200, 0);
      shotAim.startDraw(time.now());
      play(1000, 10); // still turning right up to release

      const staleLive = channel.last("aim")?.payload;
      expect(staleLive).toBeDefined();

      const t = time.now();
      shotAim.shoot(1, 1, t);

      const shotMessage = sent.find(
        (input): input is Extract<TargetRangeInput, { type: "shoot" }> => input.type === "shoot",
      );
      expect(shotMessage).toBeDefined();

      // Replay the same "aim" messages the controller actually streamed through the real host
      // reducer, so `state.players[0].aim` is exactly what the TV would have received.
      let state = tickUntil(init([alice], 1), "open");
      for (const input of sent) {
        if (input.type !== "aim") continue;
        const atMs = timestamps.get(input);
        if (atMs === undefined) continue;
        state = onPlayerInput(state, alice, input, ctxAt(atMs));
      }
      state = { ...state, nowMs: t };

      // `shownDelayMs(path)` is what `scene.ts`'s `playbackDelayMsOf` actually renders this
      // player's crosshair with today (relay: 180 ms; direct: ~33 ms at 30 Hz) -- not a single
      // guessed constant shared by both paths.
      const playback = createCrosshairPlayback();
      const shown = playback
        .at(state, 0, () => shownDelayMs(path))
        .find((crosshair) => crosshair.id === alice.id);
      expect(shown).toBeDefined();

      const shotPoint = aimPoint(shotMessage!.payload.aim);
      expect({ x: Math.round(shotPoint.x), y: Math.round(shotPoint.y) }).toEqual({
        x: shown!.x,
        y: shown!.y,
      });

      // Proves the fix matters: the old code sent the phone's freshest live sample instead, which
      // lands on a different screen point while the aim is still moving at release.
      const livePoint = aimPoint(staleLive!);
      expect({ x: Math.round(livePoint.x), y: Math.round(livePoint.y) }).not.toEqual({
        x: shown!.x,
        y: shown!.y,
      });
      expect(shotMessage!.payload.aim).not.toEqual(staleLive);
    });
  },
);
