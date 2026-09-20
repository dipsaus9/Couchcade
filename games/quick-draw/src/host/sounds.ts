/**
 * Quick Draw's sound bank (docs/architecture/audio.md "Game sound banks", "Wiring the existing
 * games"): every `.ogg`/`.wav` in `assets/sounds/` and how a cue plays it. This is the only file
 * that knows their URLs -- `cues.ts` only describes moments, never sounds.
 *
 * `playCueSound` is what `scene.ts` subscribes to `quickDrawCueEvent` with (CC-7.8).
 *
 * The `round` cue's background music loop is not wired here. `docs/architecture/audio.md`'s
 * wiring table calls for `audio.music(loop)` on `round`, but no loop file exists yet: Quick
 * Draw's `CREDITS.md` records that Chiploop (the shortlisted CC0 track) is a ~2 minute render,
 * and trimming it to a clean, seamless 16-24s loop needs someone to listen to the cut -- this
 * environment can't play audio, so it can't be verified here (see the story notes on CC-7.8 for
 * the full reasoning). A follow-up story sources or trims a verified loop and adds the two
 * `audio.music(...)` calls (`round` and, per docs/games/quick-draw.md's "Music loop in `intro`
 * and `result`", `result`) once someone can confirm the seam sounds clean.
 */
import { audio, defineSounds } from "@couchcade/audio";
import type { SoundHandle } from "@couchcade/audio";
import crowCaw from "../../assets/sounds/crow-caw.wav?url";
import drawSting from "../../assets/sounds/draw-sting.ogg?url";
import dustThud from "../../assets/sounds/dust-thud.ogg?url";
import fakeSting from "../../assets/sounds/fake-sting.ogg?url";
import glintTing from "../../assets/sounds/glint-ting.ogg?url";
import popgunPop from "../../assets/sounds/popgun-pop.ogg?url";
import roundWin from "../../assets/sounds/round-win.ogg?url";
import windLoop from "../../assets/sounds/wind-loop.ogg?url";
import type { QuickDrawCue } from "./cues.ts";

/** How far apart the result's pops play, in reaction order (docs/architecture/audio.md). */
export const popStaggerMs = 120;

export const quickDrawSounds = defineSounds("quick-draw", {
  drawSting: {
    src: drawSting,
    bus: "effects",
    duck: true,
    visual: "DRAW! callout on its first frame",
  },
  fakeSting: { src: fakeSting, bus: "effects", duck: true, visual: "Look-alike callout" },
  crowCaw: { src: crowCaw, bus: "effects", visual: "Crow flies in" },
  glintTing: { src: glintTing, bus: "effects", visual: "Popgun sparkle" },
  wind: {
    src: windLoop,
    bus: "effects",
    loop: true,
    gain: 0.6,
    visual: "Bottom panel 'Wait for it…', blowing dust",
  },
  popgunPop: { src: popgunPop, bus: "effects", visual: "BANG! flags in reaction order" },
  dustThud: { src: dustThud, bus: "effects", visual: "Dust puff" },
  roundWin: { src: roundWin, bus: "effects", visual: "Match winner shown" },
});

/** The looping wind sound started at `standoff`, stopped at `draw`. At most one plays. */
let windHandle: SoundHandle | null = null;

function playFake(cue: Extract<QuickDrawCue, { type: "fake" }>): void {
  if (cue.kind === "word") audio.play(quickDrawSounds.refs.fakeSting);
  else if (cue.kind === "crow") audio.play(quickDrawSounds.refs.crowCaw);
  else audio.play(quickDrawSounds.refs.glintTing);
}

function playResult(cue: Extract<QuickDrawCue, { type: "result" }>): void {
  // docs/games/quick-draw.md's spec also resumes the game music loop here ("Music loop in `intro`
  // and `result`"). Not wired -- see this file's header comment: no loop file exists yet.
  cue.pops.forEach((_id, index) => {
    setTimeout(() => audio.play(quickDrawSounds.refs.popgunPop), index * popStaggerMs);
  });
  audio.play(quickDrawSounds.refs.dustThud);
  if (cue.winners.length > 0) audio.play("celebrate");
}

/** Turns one Quick Draw cue into `@couchcade/audio` calls (docs/architecture/audio.md's table). */
export function playCueSound(cue: QuickDrawCue): void {
  switch (cue.type) {
    case "round":
      // Music isn't wired yet -- see this file's header comment.
      return;
    case "standoff":
      audio.music(null, { fadeMs: 150 });
      windHandle = audio.play(quickDrawSounds.refs.wind);
      return;
    case "fake":
      playFake(cue);
      return;
    case "draw":
      windHandle?.stop();
      windHandle = null;
      audio.play(quickDrawSounds.refs.drawSting);
      return;
    case "foul":
      audio.play("foul");
      return;
    case "result":
      playResult(cue);
      return;
    case "over":
      audio.play(quickDrawSounds.refs.roundWin);
      return;
  }
}
