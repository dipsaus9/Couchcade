/**
 * Target Range's sound bank (docs/architecture/audio.md "Game sound banks", "Wiring the existing
 * games"): every `.ogg`/`.wav` in `assets/sounds/` and how a cue plays it. This is the only file
 * that knows their URLs -- `cues.ts` only describes moments, never sounds.
 *
 * `playCueSound` is what `scene.ts` subscribes to `targetRangeCueEvent` with (CC-7.8).
 */
import { audio, defineSounds } from "@couchcade/audio";
import type { SoundHandle } from "@couchcade/audio";
import arrowThudFence from "../../assets/sounds/arrow-thud-fence.ogg?url";
import arrowThudStraw from "../../assets/sounds/arrow-thud-straw.ogg?url";
import arrowWhoosh from "../../assets/sounds/arrow-whoosh.wav?url";
import bullseyeDing from "../../assets/sounds/bullseye-ding.ogg?url";
import clockTick from "../../assets/sounds/clock-tick.ogg?url";
import drawCreak from "../../assets/sounds/draw-creak.ogg?url";
import gameMusicLoop from "../../assets/sounds/game-music-loop.ogg?url";
import matchEnd from "../../assets/sounds/match-end.ogg?url";
import releaseTwang from "../../assets/sounds/release-twang.wav?url";
import roundStart from "../../assets/sounds/round-start.ogg?url";
import windLoop from "../../assets/sounds/wind-loop.ogg?url";
import type { TargetRangeCue } from "./cues.ts";

export const targetRangeSounds = defineSounds("target-range", {
  gameMusicLoop: {
    src: gameMusicLoop,
    bus: "music",
    visual: "Round title in the bottom panel, wind flag",
  },
  roundStart: { src: roundStart, bus: "effects", visual: "Round title in the bottom panel" },
  wind: {
    src: windLoop,
    bus: "effects",
    loop: true,
    gain: 0.6,
    visual: "Wind flag flaps, rounds 2 to 4",
  },
  drawCreak: { src: drawCreak, bus: "effects", visual: "Crosshair appears" },
  releaseTwang: { src: releaseTwang, bus: "effects", visual: "Arrow flies" },
  arrowWhoosh: { src: arrowWhoosh, bus: "effects", visual: "Arrow flies" },
  arrowThudStraw: { src: arrowThudStraw, bus: "effects", visual: "Arrow stub in the target" },
  arrowThudFence: { src: arrowThudFence, bus: "effects", visual: "Arrow stub past the target" },
  clockTick: { src: clockTick, bus: "effects", visual: "Clock number for the last 3 seconds" },
  bullseyeDing: { src: bullseyeDing, bus: "effects", visual: "BULLSEYE! callout" },
  matchEnd: { src: matchEnd, bus: "effects", visual: "Bottom panel: a player wins the match" },
});

/** The looping wind sound started from round 2, stopped at `roundEnd`. At most one plays. */
let windHandle: SoundHandle | null = null;
/** Releases the duck `open` applies, until `reveal` releases it (audio.md "Ducking" rule 2). */
let releaseOpenDuck: (() => void) | null = null;

/** Turns one Target Range cue into `@couchcade/audio` calls (docs/architecture/audio.md's table). */
export function playCueSound(cue: TargetRangeCue): void {
  switch (cue.type) {
    case "round":
      audio.music(targetRangeSounds.refs.gameMusicLoop);
      audio.play(targetRangeSounds.refs.roundStart);
      if (cue.round >= 2) windHandle = audio.play(targetRangeSounds.refs.wind);
      return;
    case "open":
      releaseOpenDuck?.();
      releaseOpenDuck = audio.duck({ level: 0.5 });
      return;
    case "draw":
      audio.play(targetRangeSounds.refs.drawCreak);
      return;
    case "shoot":
      audio.play(targetRangeSounds.refs.releaseTwang);
      audio.play(targetRangeSounds.refs.arrowWhoosh);
      return;
    case "land":
      audio.play(
        cue.points > 0
          ? targetRangeSounds.refs.arrowThudStraw
          : targetRangeSounds.refs.arrowThudFence,
      );
      return;
    case "tick":
      audio.play(targetRangeSounds.refs.clockTick);
      return;
    case "reveal":
      releaseOpenDuck?.();
      releaseOpenDuck = null;
      if (cue.bullseye) {
        audio.play(targetRangeSounds.refs.bullseyeDing);
        audio.play("celebrate");
      }
      return;
    case "roundEnd":
      windHandle?.stop();
      windHandle = null;
      return;
    case "over":
      audio.play(targetRangeSounds.refs.matchEnd);
      return;
  }
}
